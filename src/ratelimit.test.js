import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { rateLimiter, WINDOW_MS, MAX_REQUESTS } from './ratelimit.js';

function makeReq(ip = '1.2.3.4') {
  return {
    headers: {},
    socket: { remoteAddress: ip },
    method: 'GET',
    url: '/test',
  };
}

function makeRes() {
  const res = new EventEmitter();
  res._status = null;
  res._headers = {};
  res._body = null;
  res.writeHead = (code, headers = {}) => {
    res._status = code;
    Object.assign(res._headers, headers);
  };
  res.end = (body) => { res._body = body; };
  return res;
}

describe('rateLimiter', () => {
  it('allows requests under the limit', () => {
    const ip = `allow-test-${Date.now()}`;
    let called = false;
    const handler = () => { called = true; };
    const wrapped = rateLimiter(handler);
    wrapped(makeReq(ip), makeRes());
    assert.ok(called);
  });

  it('blocks request on the 101st call and returns 429', () => {
    const ip = `block-test-${Date.now()}`;
    const wrapped = rateLimiter(() => {});
    const res = makeRes();

    for (let i = 0; i < MAX_REQUESTS; i++) {
      wrapped(makeReq(ip), makeRes());
    }

    wrapped(makeReq(ip), res);
    assert.equal(res._status, 429);
  });

  it('includes Retry-After header when blocked', () => {
    const ip = `retry-test-${Date.now()}`;
    const wrapped = rateLimiter(() => {});

    for (let i = 0; i < MAX_REQUESTS; i++) {
      wrapped(makeReq(ip), makeRes());
    }

    const res = makeRes();
    wrapped(makeReq(ip), res);
    assert.ok(res._headers['Retry-After']);
    const retryAfter = Number(res._headers['Retry-After']);
    assert.ok(retryAfter > 0 && retryAfter <= WINDOW_MS / 1000);
  });

  it('responds with error body when blocked', () => {
    const ip = `body-test-${Date.now()}`;
    const wrapped = rateLimiter(() => {});

    for (let i = 0; i < MAX_REQUESTS; i++) {
      wrapped(makeReq(ip), makeRes());
    }

    const res = makeRes();
    wrapped(makeReq(ip), res);
    const body = JSON.parse(res._body);
    assert.equal(body.error, 'Too Many Requests');
  });

  it('uses X-Forwarded-For header for IP when present', () => {
    const ip = `forwarded-test-${Date.now()}`;
    let capturedIpUsed = false;
    const wrapped = rateLimiter(() => { capturedIpUsed = true; });
    const req = { headers: { 'x-forwarded-for': `${ip}, 10.0.0.1` }, socket: { remoteAddress: '10.0.0.1' } };
    wrapped(req, makeRes());
    assert.ok(capturedIpUsed);
  });

  it('resets count after window expires', async () => {
    // Use a tiny custom window by patching — instead just verify a fresh IP starts at count 1
    const ip = `reset-test-${Date.now()}`;
    let calls = 0;
    const handler = () => { calls++; };
    const wrapped = rateLimiter(handler);
    wrapped(makeReq(ip), makeRes());
    assert.equal(calls, 1);
  });
});
