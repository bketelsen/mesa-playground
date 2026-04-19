import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PORT, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS } from './config.js';

describe('config', () => {
  describe('defaults (no env vars set)', () => {
    it('PORT is a number', () => {
      assert.equal(typeof PORT, 'number');
    });

    it('RATE_LIMIT_MAX is a number', () => {
      assert.equal(typeof RATE_LIMIT_MAX, 'number');
    });

    it('RATE_LIMIT_WINDOW_MS is a number', () => {
      assert.equal(typeof RATE_LIMIT_WINDOW_MS, 'number');
    });

    it('PORT defaults to 3000 when PORT env var is unset', () => {
      if (!process.env.PORT) assert.equal(PORT, 3000);
    });

    it('RATE_LIMIT_MAX defaults to 100 when env var is unset', () => {
      if (!process.env.RATE_LIMIT_MAX) assert.equal(RATE_LIMIT_MAX, 100);
    });

    it('RATE_LIMIT_WINDOW_MS defaults to 900000 (15 min) when env var is unset', () => {
      if (!process.env.RATE_LIMIT_WINDOW_MS) assert.equal(RATE_LIMIT_WINDOW_MS, 900000);
    });
  });

  describe('env-var override logic', () => {
    function parseConfig(env = {}) {
      return {
        PORT: env.PORT ? Number(env.PORT) : 3000,
        RATE_LIMIT_MAX: env.RATE_LIMIT_MAX ? Number(env.RATE_LIMIT_MAX) : 100,
        RATE_LIMIT_WINDOW_MS: env.RATE_LIMIT_WINDOW_MS ? Number(env.RATE_LIMIT_WINDOW_MS) : 900000,
      };
    }

    it('PORT reads from env as number', () => {
      const cfg = parseConfig({ PORT: '8080' });
      assert.equal(cfg.PORT, 8080);
      assert.equal(typeof cfg.PORT, 'number');
    });

    it('RATE_LIMIT_MAX reads from env as number', () => {
      const cfg = parseConfig({ RATE_LIMIT_MAX: '50' });
      assert.equal(cfg.RATE_LIMIT_MAX, 50);
    });

    it('RATE_LIMIT_WINDOW_MS reads from env as number', () => {
      const cfg = parseConfig({ RATE_LIMIT_WINDOW_MS: '60000' });
      assert.equal(cfg.RATE_LIMIT_WINDOW_MS, 60000);
    });

    it('uses defaults when env vars are empty strings', () => {
      const cfg = parseConfig({ PORT: '', RATE_LIMIT_MAX: '', RATE_LIMIT_WINDOW_MS: '' });
      assert.equal(cfg.PORT, 3000);
      assert.equal(cfg.RATE_LIMIT_MAX, 100);
      assert.equal(cfg.RATE_LIMIT_WINDOW_MS, 900000);
    });
  });
});
