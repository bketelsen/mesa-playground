import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { requestLogger } from './middleware.js';
import { logger } from './logger.js';

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

  it('logs correct fields on finish', () => {
    const logged = [];
    // Intercept pino logger.info calls
    const origInfo = logger.info.bind(logger);
    logger.info = (obj, ...args) => {
      logged.push(typeof obj === 'object' ? obj : { msg: obj });
      origInfo(obj, ...args);
    };

    const handler = (req, res) => {
      res.writeHead(201);
      res.end();
    };
    const req = { method: 'POST', url: '/items' };
    const res = makeRes();
    requestLogger(handler)(req, res);

    logger.info = origInfo;

    assert.equal(logged.length, 1);
    const entry = logged[0];
    assert.equal(entry.method, 'POST');
    assert.equal(entry.url, '/items');
    assert.equal(entry.status, 201);
    assert.ok(typeof entry.responseTime === 'number');
  });
});
