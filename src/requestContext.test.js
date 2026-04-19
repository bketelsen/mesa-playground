import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { correlationId, requestContext } from './requestContext.js';
import { sendError } from './errors.js';

function makeRes() {
  const res = new EventEmitter();
  res._headers = {};
  res._status = 200;
  res.writeHead = (code, headers) => {
    res._status = code;
    Object.assign(res._headers, headers || {});
  };
  res.end = () => res.emit('finish');
  return res;
}

describe('correlationId middleware', () => {
  it('generates a UUID and attaches to req.requestId', (_, done) => {
    const req = { headers: {}, method: 'GET', url: '/test' };
    const res = makeRes();
    correlationId((req2, res2) => {
      assert.ok(req2.requestId);
      assert.match(req2.requestId, /^[0-9a-f-]{36}$/);
      res2.writeHead(200, { 'Content-Type': 'application/json' });
      res2.end();
      done();
    })(req, res);
  });

  it('passes through client-supplied X-Request-Id', (_, done) => {
    const customId = 'my-custom-id-123';
    const req = { headers: { 'x-request-id': customId }, method: 'GET', url: '/test' };
    const res = makeRes();
    correlationId((req2, res2) => {
      assert.equal(req2.requestId, customId);
      res2.writeHead(200, {});
      res2.end();
      done();
    })(req, res);
  });

  it('echoes generated X-Request-Id in response headers', (_, done) => {
    const req = { headers: {}, method: 'GET', url: '/test' };
    const res = makeRes();
    correlationId((req2, res2) => {
      res2.writeHead(200, { 'Content-Type': 'application/json' });
      res2.end();
      assert.ok(res._headers['x-request-id'], 'response should have x-request-id header');
      assert.equal(res._headers['x-request-id'], req2.requestId);
      done();
    })(req, res);
  });

  it('echoes client-supplied X-Request-Id in response headers', (_, done) => {
    const customId = 'trace-abc-456';
    const req = { headers: { 'x-request-id': customId }, method: 'GET', url: '/test' };
    const res = makeRes();
    correlationId((req2, res2) => {
      res2.writeHead(200, {});
      res2.end();
      assert.equal(res._headers['x-request-id'], customId);
      done();
    })(req, res);
  });

  it('stores requestId in AsyncLocalStorage', (_, done) => {
    const req = { headers: {}, method: 'GET', url: '/test' };
    const res = makeRes();
    correlationId((req2, res2) => {
      const ctx = requestContext.getStore();
      assert.ok(ctx);
      assert.equal(ctx.requestId, req2.requestId);
      res2.writeHead(200, {});
      res2.end();
      done();
    })(req, res);
  });

  it('req.log child logger includes requestId in log bindings', (_, done) => {
    const req = { headers: {}, method: 'GET', url: '/test' };
    const res = makeRes();
    correlationId((req2, res2) => {
      assert.ok(req2.log, 'req.log should be set');
      assert.equal(req2.log.bindings().requestId, req2.requestId);
      res2.writeHead(200, {});
      res2.end();
      done();
    })(req, res);
  });

  it('error response body includes requestId field', (_, done) => {
    const req = { headers: {}, method: 'GET', url: '/test' };
    const chunks = [];
    const res = new EventEmitter();
    res._headers = {};
    res._status = 200;
    res.writeHead = (code, headers) => {
      res._status = code;
      Object.assign(res._headers, headers || {});
    };
    res.end = (data) => {
      if (data) chunks.push(data);
      res.emit('finish');
    };

    correlationId((req2, res2) => {
      sendError(res2, 404, 'Not Found');
      const body = JSON.parse(chunks.join(''));
      assert.ok(body.requestId, 'requestId should be present in error response body');
      assert.equal(body.requestId, req2.requestId);
      done();
    })(req, res);
  });
});
