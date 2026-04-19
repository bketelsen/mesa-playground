import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { DRAIN_TIMEOUT_MS } from './config.js';

// Build a minimal server that mirrors index.js shutdown logic for isolated testing
function makeTestServer() {
  let isShuttingDown = false;

  const server = createServer((req, res) => {
    if (req.url === '/readiness') {
      if (isShuttingDown) {
        res.writeHead(503, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'draining' }));
      } else {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ready' }));
      }
      return;
    }

    // Simulate a slow in-flight request
    if (req.url === '/slow') {
      setTimeout(() => {
        if (!res.destroyed) {
          res.writeHead(200);
          res.end('done');
        }
      }, 100);
      return;
    }

    res.writeHead(404);
    res.end();
  });

  function beginShutdown(drainTimeoutMs = DRAIN_TIMEOUT_MS) {
    isShuttingDown = true;
    return new Promise((resolve) => {
      server.close(resolve);
      const t = setTimeout(resolve, drainTimeoutMs);
      if (t.unref) t.unref();
    });
  }

  // Set flag only, without stopping the server — useful for probing the readiness endpoint
  function markShuttingDown() {
    isShuttingDown = true;
  }

  return { server, beginShutdown, markShuttingDown };
}

describe('GET /readiness', () => {
  let server;
  let base;
  let markShuttingDown;

  before(() => new Promise((resolve) => {
    ({ server, markShuttingDown } = makeTestServer());
    server.listen(0, () => {
      base = `http://localhost:${server.address().port}`;
      resolve();
    });
  }));

  after(() => new Promise((resolve) => server.close(resolve)));

  it('returns 200 when server is ready', async () => {
    const res = await fetch(`${base}/readiness`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.status, 'ready');
  });

  it('returns 503 once shutdown flag is set', async () => {
    markShuttingDown();
    const res = await fetch(`${base}/readiness`);
    assert.equal(res.status, 503);
    const body = await res.json();
    assert.equal(body.status, 'draining');
  });
});

describe('graceful shutdown — in-flight requests complete', () => {
  let server;
  let base;
  let beginShutdown;

  before(() => new Promise((resolve) => {
    ({ server, beginShutdown } = makeTestServer());
    server.listen(0, () => {
      base = `http://localhost:${server.address().port}`;
      resolve();
    });
  }));

  after(() => new Promise((resolve) => server.close(resolve)));

  it('in-flight slow request completes after shutdown begins', async () => {
    // Fire the slow request first so a connection is already established,
    // then begin shutdown — existing connection must drain before exit.
    const slowPromise = fetch(`${base}/slow`);
    // Give the request time to reach the server before we close
    await new Promise((r) => setTimeout(r, 20));
    const shutdownDone = beginShutdown(5000);
    const res = await slowPromise;
    assert.equal(res.status, 200);
    await shutdownDone;
  });
});

describe('DRAIN_TIMEOUT_MS config', () => {
  it('defaults to 30000ms when env var is unset', () => {
    const expected = process.env.DRAIN_TIMEOUT_MS ? Number(process.env.DRAIN_TIMEOUT_MS) : 30000;
    assert.equal(DRAIN_TIMEOUT_MS, expected);
  });
});
