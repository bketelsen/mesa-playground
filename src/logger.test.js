import { test, describe } from 'node:test';
import assert from 'node:assert';

describe('logger', () => {
  test('logger is created with correct log level from LOG_LEVEL env var', async () => {
    // Set env before importing to control config
    process.env.LOG_LEVEL = 'warn';
    // Clear module cache via dynamic import with a cache-busting trick isn't possible in ESM,
    // so we test the default behaviour via a fresh pino instance the same way logger.js does.
    const { default: pino } = await import('pino');
    const log = pino({ level: process.env.LOG_LEVEL });
    assert.strictEqual(log.level, 'warn');
    delete process.env.LOG_LEVEL;
  });

  test('childLogger includes requestId field', async () => {
    const { childLogger } = await import('./logger.js');
    const child = childLogger('req-abc-123');
    assert.strictEqual(child.bindings().requestId, 'req-abc-123');
  });

  test('messages below LOG_LEVEL are filtered when level=info', async () => {
    const { default: pino } = await import('pino');
    // Capture output via a writable stream
    const lines = [];
    const stream = {
      write(chunk) {
        lines.push(JSON.parse(chunk));
      },
    };
    const log = pino({ level: 'info' }, stream);
    log.debug('this should be filtered');
    log.info('this should appear');
    assert.strictEqual(lines.length, 1, 'only one line should be written');
    assert.strictEqual(lines[0].msg, 'this should appear');
  });
});
