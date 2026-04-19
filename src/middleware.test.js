import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { requestLogger } from './middleware.js';

function makeRes(statusToWrite) {
  const res = new EventEmitter();
  res.writeHead = (code) => { res._status = code; };
  res._status = statusToWrite ?? 200;
  res.end = () => { res.emit('finish'); };
  return res;
}

describe('requestLogger', () => {
  it('wraps handler and calls it', () => {
    let called = false;
    const handler = () => { called = true; };
    const req = { method: 'GET', url: '/test' };
    const res = makeRes(200);
    requestLogger(handler)(req, res);
    assert.ok(called);
  });

  it('logs correct fields on finish via req.log', () => {
    const logged = [];
    const mockLog = { info: (obj) => logged.push(obj) };

    const handler = (req, res) => {
      res.writeHead(201);
      res.end();
    };
    const req = { method: 'POST', url: '/items', log: mockLog };
    const res = makeRes();
    requestLogger(handler)(req, res);

    assert.equal(logged.length, 1);
    const entry = logged[0];
    assert.equal(entry.method, 'POST');
    assert.equal(entry.url, '/items');
    assert.equal(entry.status, 201);
    assert.ok(typeof entry.responseTime === 'number');
  });
});
