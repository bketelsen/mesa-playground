import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { server } from './index.js';

const PORT = process.env.PORT || 3000;
const BASE = `http://localhost:${PORT}`;

before(() => new Promise(resolve => {
  if (server.listening) return resolve();
  server.once('listening', resolve);
}));

after(() => new Promise(resolve => server.close(resolve)));

describe('GET /health', () => {
  it('returns 200 with ok status', async () => {
    const res = await fetch(`${BASE}/health`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.status, 'ok');
    assert.ok(body.timestamp);
  });

  it('includes uptime as a number', async () => {
    const res = await fetch(`${BASE}/health`);
    const body = await res.json();
    assert.ok(typeof body.uptime === 'number', 'uptime should be a number');
  });

  it('includes requestCount as a number', async () => {
    const res = await fetch(`${BASE}/health`);
    const body = await res.json();
    assert.ok(typeof body.requestCount === 'number', 'requestCount should be a number');
  });

  it('includes activeConnections as a number', async () => {
    const res = await fetch(`${BASE}/health`);
    const body = await res.json();
    assert.ok(typeof body.activeConnections === 'number', 'activeConnections should be a number');
  });
});

describe('unknown routes', () => {
  it('returns 404 in standard error format', async () => {
    const res = await fetch(`${BASE}/not-a-real-route`);
    assert.equal(res.status, 404);
    const body = await res.json();
    assert.deepEqual(body, { error: { code: 404, message: 'Not Found' } });
  });

  it('returns 404 for POST to unknown route', async () => {
    const res = await fetch(`${BASE}/unknown`, { method: 'POST' });
    assert.equal(res.status, 404);
    const body = await res.json();
    assert.equal(body.error.code, 404);
  });
});

describe('error response format', () => {
  it('error body has code and message fields', async () => {
    const res = await fetch(`${BASE}/anything`);
    const body = await res.json();
    assert.ok(typeof body.error === 'object');
    assert.ok(typeof body.error.code === 'number');
    assert.ok(typeof body.error.message === 'string');
  });
});
