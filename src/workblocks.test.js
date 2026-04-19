import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { rateLimiter } from './ratelimit.js';
import { workBlocksRouter } from './workblocksRouter.js';
import { sendError } from './errors.js';
import { trackConnections } from './metrics.js';
import { reset as resetWorkBlocks } from './workblocks.js';

let server;
let base;

before(() => {
  server = createServer(rateLimiter(async (req, res) => {
    try {
      if (req.url?.startsWith('/api/workblocks')) {
        await workBlocksRouter(req, res);
        return;
      }
      sendError(res, 404, 'Not Found');
    } catch {
      sendError(res, 500, 'Internal Server Error');
    }
  }));
  trackConnections(server);
  return new Promise(resolve => server.listen(0, () => {
    base = `http://localhost:${server.address().port}`;
    resolve();
  }));
});

after(() => new Promise(resolve => server.close(resolve)));

beforeEach(() => resetWorkBlocks());

async function post(path, body) {
  const res = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

async function get(path) {
  const res = await fetch(`${base}${path}`);
  return { status: res.status, body: await res.json() };
}

async function patch(path, body) {
  const res = await fetch(`${base}${path}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

describe('work blocks CRUD', () => {
  it('creates a work block', async () => {
    const { status, body } = await post('/api/workblocks', { title: 'Sprint 1' });
    assert.equal(status, 201);
    assert.equal(body.title, 'Sprint 1');
    assert.equal(body.status, 'ready');
    assert.ok(typeof body.id === 'string');
  });

  it('returns 400 when title is missing', async () => {
    const { status } = await post('/api/workblocks', {});
    assert.equal(status, 400);
  });

  it('lists work blocks', async () => {
    await post('/api/workblocks', { title: 'Block A' });
    await post('/api/workblocks', { title: 'Block B' });
    const { status, body } = await get('/api/workblocks');
    assert.equal(status, 200);
    assert.equal(body.length, 2);
  });

  it('gets a single work block', async () => {
    const { body: created } = await post('/api/workblocks', { title: 'Solo' });
    const { status, body } = await get(`/api/workblocks/${created.id}`);
    assert.equal(status, 200);
    assert.equal(body.id, created.id);
  });

  it('returns 404 for unknown work block', async () => {
    const { status } = await get('/api/workblocks/nonexistent');
    assert.equal(status, 404);
  });
});

describe('work block manual PATCH transitions', () => {
  it('transitions ready -> in_progress', async () => {
    const { body: wb } = await post('/api/workblocks', { title: 'WB' });
    const { status, body } = await patch(`/api/workblocks/${wb.id}`, { status: 'in_progress' });
    assert.equal(status, 200);
    assert.equal(body.status, 'in_progress');
  });

  it('transitions ready -> complete', async () => {
    const { body: wb } = await post('/api/workblocks', { title: 'WB' });
    const { status, body } = await patch(`/api/workblocks/${wb.id}`, { status: 'complete' });
    assert.equal(status, 200);
    assert.equal(body.status, 'complete');
  });

  it('returns 422 for invalid transition complete -> ready', async () => {
    const { body: wb } = await post('/api/workblocks', { title: 'WB' });
    await patch(`/api/workblocks/${wb.id}`, { status: 'complete' });
    const { status } = await patch(`/api/workblocks/${wb.id}`, { status: 'ready' });
    assert.equal(status, 422);
  });

  it('returns 400 for unknown status value', async () => {
    const { body: wb } = await post('/api/workblocks', { title: 'WB' });
    const { status } = await patch(`/api/workblocks/${wb.id}`, { status: 'invalid' });
    assert.equal(status, 400);
  });

  it('returns 404 for unknown work block', async () => {
    const { status } = await patch('/api/workblocks/ghost', { status: 'complete' });
    assert.equal(status, 404);
  });
});

describe('auto-close work block when all issues done', () => {
  it('auto-completes work block when last issue transitions to done', async () => {
    const { body: wb } = await post('/api/workblocks', { title: 'Auto Close WB' });
    await post(`/api/workblocks/${wb.id}/issues`, { issueId: 'issue-1' });
    await post(`/api/workblocks/${wb.id}/issues`, { issueId: 'issue-2' });

    // Mark issue-1 done — work block should stay open
    const { body: partial } = await patch(`/api/workblocks/${wb.id}/issues/issue-1`, { status: 'done' });
    assert.equal(partial.autoCompleted, false);
    assert.notEqual(partial.workBlock.status, 'complete');

    // Mark issue-2 done — all issues done, work block should auto-complete
    const { status, body } = await patch(`/api/workblocks/${wb.id}/issues/issue-2`, { status: 'done' });
    assert.equal(status, 200);
    assert.equal(body.autoCompleted, true);
    assert.equal(body.workBlock.status, 'complete');
  });

  it('does not auto-complete when only some issues are done', async () => {
    const { body: wb } = await post('/api/workblocks', { title: 'Partial WB' });
    await post(`/api/workblocks/${wb.id}/issues`, { issueId: 'issue-a' });
    await post(`/api/workblocks/${wb.id}/issues`, { issueId: 'issue-b' });

    const { body } = await patch(`/api/workblocks/${wb.id}/issues/issue-a`, { status: 'done' });
    assert.equal(body.autoCompleted, false);
    assert.notEqual(body.workBlock.status, 'complete');
  });

  it('does not auto-complete a work block with no linked issues', async () => {
    const { body: wb } = await post('/api/workblocks', { title: 'Empty WB' });
    // No issues linked — simulate an issue update for a random id not linked to this block
    const { status } = await patch(`/api/workblocks/${wb.id}/issues/issue-x`, { status: 'done' });
    // Issue isn't linked so we expect the work block to remain as-is
    assert.equal(status, 200);
    const { body: fetched } = await get(`/api/workblocks/${wb.id}`);
    assert.notEqual(fetched.status, 'complete');
  });

  it('does not auto-complete a work block already complete', async () => {
    const { body: wb } = await post('/api/workblocks', { title: 'Already Done WB' });
    await post(`/api/workblocks/${wb.id}/issues`, { issueId: 'issue-z' });
    await patch(`/api/workblocks/${wb.id}`, { status: 'complete' });

    // Another issue-done event should be a no-op (block already complete)
    const { body } = await patch(`/api/workblocks/${wb.id}/issues/issue-z`, { status: 'done' });
    assert.equal(body.autoCompleted, false);
    assert.equal(body.workBlock.status, 'complete');
  });

  it('returns 404 when patching issue status on unknown work block', async () => {
    const { status } = await patch('/api/workblocks/ghost/issues/issue-1', { status: 'done' });
    assert.equal(status, 404);
  });

  it('handles single-issue work block auto-close', async () => {
    const { body: wb } = await post('/api/workblocks', { title: 'Single Issue WB' });
    await post(`/api/workblocks/${wb.id}/issues`, { issueId: 'solo-issue' });

    const { body } = await patch(`/api/workblocks/${wb.id}/issues/solo-issue`, { status: 'done' });
    assert.equal(body.autoCompleted, true);
    assert.equal(body.workBlock.status, 'complete');
  });
});

describe('link issues to work block', () => {
  it('links an issue to a work block', async () => {
    const { body: wb } = await post('/api/workblocks', { title: 'WB' });
    const { status, body } = await post(`/api/workblocks/${wb.id}/issues`, { issueId: 'my-issue' });
    assert.equal(status, 200);
    assert.equal(body.linked, true);
  });

  it('returns 400 when issueId is missing', async () => {
    const { body: wb } = await post('/api/workblocks', { title: 'WB' });
    const { status } = await post(`/api/workblocks/${wb.id}/issues`, {});
    assert.equal(status, 400);
  });

  it('returns 404 when linking to unknown work block', async () => {
    const { status } = await post('/api/workblocks/ghost/issues', { issueId: 'x' });
    assert.equal(status, 404);
  });
});
