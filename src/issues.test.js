import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { server } from './index.js';
import { upsertIssue, setRunCount, getIssues, getHighRetryIssues, reset, HIGH_RETRY_THRESHOLD } from './issues.js';

const PORT = process.env.PORT || 3000;
const BASE = `http://localhost:${PORT}`;

before(() => new Promise(resolve => {
  if (server.listening) return resolve();
  server.once('listening', resolve);
}));

after(() => new Promise(resolve => server.close(resolve)));

beforeEach(() => reset());

describe('issues store', () => {
  it('upsertIssue stores and getIssues returns it', () => {
    upsertIssue({ key: 'SO-1', title: 'Test issue', assignee: 'alice', status: 'open' });
    const all = getIssues();
    assert.equal(all.length, 1);
    assert.equal(all[0].key, 'SO-1');
    assert.equal(all[0].title, 'Test issue');
    assert.equal(all[0].assignee, 'alice');
    assert.equal(all[0].status, 'open');
    assert.equal(all[0].run_count, 0);
  });

  it('high_retry is false when run_count < 3', () => {
    upsertIssue({ key: 'SO-2', title: 'Low retry', run_count: 2 });
    const all = getIssues();
    assert.equal(all[0].high_retry, false);
  });

  it('high_retry is true when run_count === 3 (>= threshold)', () => {
    upsertIssue({ key: 'SO-3', title: 'At threshold', run_count: HIGH_RETRY_THRESHOLD });
    const all = getIssues();
    assert.equal(all[0].high_retry, true);
  });

  it('high_retry is true when run_count > 3', () => {
    upsertIssue({ key: 'SO-4', title: 'Above threshold', run_count: 5 });
    const all = getIssues();
    assert.equal(all[0].high_retry, true);
  });

  it('getHighRetryIssues returns only issues with run_count >= 3', () => {
    upsertIssue({ key: 'SO-5', title: 'Below', run_count: 2 });
    upsertIssue({ key: 'SO-6', title: 'At', run_count: 3 });
    upsertIssue({ key: 'SO-7', title: 'Above', run_count: 4 });
    const high = getHighRetryIssues();
    assert.equal(high.length, 2);
    const keys = high.map(i => i.key);
    assert.ok(keys.includes('SO-6'));
    assert.ok(keys.includes('SO-7'));
    assert.ok(!keys.includes('SO-5'));
  });

  it('setRunCount updates run_count and high_retry flag', () => {
    upsertIssue({ key: 'SO-8', title: 'Run update', run_count: 0 });
    setRunCount('SO-8', 3);
    const all = getIssues();
    assert.equal(all[0].run_count, 3);
    assert.equal(all[0].high_retry, true);
  });
});

describe('GET /api/v1/issues', () => {
  it('returns 200 with JSON content-type', async () => {
    const res = await fetch(`${BASE}/api/v1/issues`);
    assert.equal(res.status, 200);
    assert.ok(res.headers.get('content-type')?.includes('application/json'));
  });

  it('returns empty array when no issues', async () => {
    const res = await fetch(`${BASE}/api/v1/issues`);
    const body = await res.json();
    assert.deepEqual(body, []);
  });

  it('returns all issues with required board fields', async () => {
    upsertIssue({ key: 'SO-10', title: 'Board issue', assignee: 'bob', status: 'in_progress', run_count: 1 });
    const res = await fetch(`${BASE}/api/v1/issues`);
    const body = await res.json();
    assert.equal(body.length, 1);
    const item = body[0];
    assert.ok('key' in item, 'missing key');
    assert.ok('title' in item, 'missing title');
    assert.ok('assignee' in item, 'missing assignee');
    assert.ok('status' in item, 'missing status');
    assert.ok('run_count' in item, 'missing run_count');
    assert.ok('high_retry' in item, 'missing high_retry');
  });

  it('?high_retry=true returns only issues with run_count >= 3', async () => {
    upsertIssue({ key: 'SO-11', title: 'Low', run_count: 2 });
    upsertIssue({ key: 'SO-12', title: 'High', run_count: 3 });
    const res = await fetch(`${BASE}/api/v1/issues?high_retry=true`);
    const body = await res.json();
    assert.equal(body.length, 1);
    assert.equal(body[0].key, 'SO-12');
    assert.equal(body[0].high_retry, true);
  });

  it('run_count exactly 2 does NOT appear in high_retry filter', async () => {
    upsertIssue({ key: 'SO-13', title: 'Near threshold', run_count: 2 });
    const res = await fetch(`${BASE}/api/v1/issues?high_retry=true`);
    const body = await res.json();
    assert.equal(body.length, 0);
  });
});
