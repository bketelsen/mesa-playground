import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { rateLimiter, MAX_REQUESTS } from './ratelimit.js';
import { usersRouter } from './users.js';
import { sendError } from './errors.js';
import { incrementRequests, trackConnections, getMetrics } from './metrics.js';
import { reset } from './store.js';

// Build an isolated server from components (distinct from the auto-started one in index.js)
// so this file does not conflict with index.test.js's server singleton.
let server;
let base;

before(() => {
  server = createServer(rateLimiter(async (req, res) => {
    incrementRequests();
    try {
      if (req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', timestamp: new Date().toISOString(), ...getMetrics() }));
        return;
      }
      if (req.url?.startsWith('/api/users')) {
        await usersRouter(req, res);
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

beforeEach(() => reset());

async function post(path, body, headers = {}) {
  const res = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json(), headers: res.headers };
}

async function get(path, headers = {}) {
  const res = await fetch(`${base}${path}`, { headers });
  return { status: res.status, body: await res.json(), headers: res.headers };
}

async function put(path, body, headers = {}) {
  const res = await fetch(`${base}${path}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

describe('auth flow', () => {
  it('creates a user and returns a token', async () => {
    const { status, body } = await post('/api/users', { name: 'Alice', email: 'alice@example.com' });
    assert.equal(status, 201);
    assert.ok(typeof body.token === 'string' && body.token.length > 0, 'token present');
  });

  it('uses token to update own profile', async () => {
    const { body: created } = await post('/api/users', { name: 'Alice', email: 'alice@example.com' });
    const { status, body } = await put(
      `/api/users/${created.id}`,
      { name: 'Alice Updated', email: 'alice@example.com' },
      { Authorization: `Bearer ${created.token}` },
    );
    assert.equal(status, 200);
    assert.equal(body.name, 'Alice Updated');
  });

  it('rejects request with missing Authorization header', async () => {
    const { body: created } = await post('/api/users', { name: 'Bob', email: 'bob@example.com' });
    const { status, body } = await put(`/api/users/${created.id}`, { name: 'Bob2', email: 'bob@example.com' });
    assert.equal(status, 401);
    assert.equal(body.error.code, 401);
  });

  it('rejects request with invalid token', async () => {
    const { body: created } = await post('/api/users', { name: 'Carol', email: 'carol@example.com' });
    const { status, body } = await put(
      `/api/users/${created.id}`,
      { name: 'Carol2', email: 'carol@example.com' },
      { Authorization: 'Bearer invalid-token-xyz' },
    );
    assert.equal(status, 401);
    assert.equal(body.error.code, 401);
  });

  it('rejects request where token belongs to a different user', async () => {
    const { body: alice } = await post('/api/users', { name: 'Alice', email: 'alice@example.com' });
    const { body: bob } = await post('/api/users', { name: 'Bob', email: 'bob@example.com' });
    const { status, body } = await put(
      `/api/users/${alice.id}`,
      { name: 'Hacked', email: 'alice@example.com' },
      { Authorization: `Bearer ${bob.token}` },
    );
    assert.equal(status, 403);
    assert.equal(body.error.code, 403);
  });
});

describe('health endpoint', () => {
  it('returns 200 with expected shape', async () => {
    const { status, body } = await get('/health');
    assert.equal(status, 200);
    assert.equal(body.status, 'ok');
    assert.ok(typeof body.uptime === 'number', 'uptime is a number');
    assert.ok(typeof body.requestCount === 'number', 'requestCount is a number');
    assert.ok(typeof body.activeConnections === 'number', 'activeConnections is a number');
    assert.ok(typeof body.timestamp === 'string', 'timestamp is a string');
  });

  it('uptime increases over time', async () => {
    const { body: first } = await get('/health');
    await new Promise(r => setTimeout(r, 50));
    const { body: second } = await get('/health');
    assert.ok(second.uptime >= first.uptime, 'uptime should be non-decreasing');
  });

  it('requestCount increments with each request', async () => {
    const { body: snap1 } = await get('/health');
    await get('/health');
    const { body: snap2 } = await get('/health');
    assert.ok(snap2.requestCount > snap1.requestCount, 'requestCount should increase');
  });
});

describe('rate limiting', () => {
  it('returns 429 after exceeding limit for a given IP', async () => {
    // Use unique IP via X-Forwarded-For to isolate from other tests
    const testIp = `10.99.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}`;
    const headers = { 'X-Forwarded-For': testIp };

    for (let i = 0; i < MAX_REQUESTS; i++) {
      await fetch(`${base}/health`, { headers });
    }

    const res = await fetch(`${base}/health`, { headers });
    assert.equal(res.status, 429);
    const body = await res.json();
    assert.equal(body.error, 'Too Many Requests');
  });

  it('429 response includes Retry-After header', async () => {
    const testIp = `10.98.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}`;
    const headers = { 'X-Forwarded-For': testIp };

    for (let i = 0; i < MAX_REQUESTS; i++) {
      await fetch(`${base}/health`, { headers });
    }

    const res = await fetch(`${base}/health`, { headers });
    assert.equal(res.status, 429);
    const retryAfter = Number(res.headers.get('Retry-After'));
    assert.ok(retryAfter > 0, 'Retry-After should be positive');
  });

  it('different IPs have independent rate limit counters', async () => {
    const r = () => Math.floor(Math.random() * 256);
    const ip1 = `10.97.${r()}.${r()}`;
    const ip2 = `10.96.${r()}.${r()}`;

    for (let i = 0; i < MAX_REQUESTS; i++) {
      await fetch(`${base}/health`, { headers: { 'X-Forwarded-For': ip1 } });
    }
    const blocked = await fetch(`${base}/health`, { headers: { 'X-Forwarded-For': ip1 } });
    assert.equal(blocked.status, 429);

    const allowed = await fetch(`${base}/health`, { headers: { 'X-Forwarded-For': ip2 } });
    assert.equal(allowed.status, 200);
  });
});
