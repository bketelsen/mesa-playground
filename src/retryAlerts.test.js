import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { server } from './index.js';
import { setRunCount, reset } from './retryAlerts.js';

const PORT = process.env.PORT || 3000;
const BASE = `http://localhost:${PORT}`;

before(() => new Promise(resolve => {
  if (server.listening) return resolve();
  server.once('listening', resolve);
}));

after(() => new Promise(resolve => server.close(resolve)));

beforeEach(() => reset());

describe('GET /api/v1/retry-alerts', () => {
  it('returns empty array when no issues exceed threshold', async () => {
    const res = await fetch(`${BASE}/api/v1/retry-alerts`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.deepEqual(body, []);
  });

  it('returns 200 with JSON content-type', async () => {
    const res = await fetch(`${BASE}/api/v1/retry-alerts`);
    assert.equal(res.status, 200);
    assert.ok(res.headers.get('content-type')?.includes('application/json'));
  });

  it('issue with exactly threshold runs is NOT included', async () => {
    const threshold = Number(process.env.RETRY_THRESHOLD ?? 3);
    setRunCount('ISSUE-1', threshold);
    const res = await fetch(`${BASE}/api/v1/retry-alerts`);
    const body = await res.json();
    assert.equal(body.length, 0, 'exactly threshold should not appear');
  });

  it('issue with threshold+1 runs IS included', async () => {
    const threshold = Number(process.env.RETRY_THRESHOLD ?? 3);
    setRunCount('ISSUE-2', threshold + 1);
    const res = await fetch(`${BASE}/api/v1/retry-alerts`);
    const body = await res.json();
    assert.equal(body.length, 1);
    assert.equal(body[0].issue_key, 'ISSUE-2');
    assert.equal(body[0].run_count, threshold + 1);
    assert.equal(body[0].threshold_exceeded, true);
  });

  it('response schema matches {issue_key, run_count, threshold_exceeded}', async () => {
    const threshold = Number(process.env.RETRY_THRESHOLD ?? 3);
    setRunCount('ISSUE-3', threshold + 2);
    const res = await fetch(`${BASE}/api/v1/retry-alerts`);
    const body = await res.json();
    assert.equal(body.length, 1);
    const item = body[0];
    assert.ok('issue_key' in item, 'missing issue_key');
    assert.ok('run_count' in item, 'missing run_count');
    assert.ok('threshold_exceeded' in item, 'missing threshold_exceeded');
    assert.equal(typeof item.issue_key, 'string');
    assert.equal(typeof item.run_count, 'number');
    assert.equal(typeof item.threshold_exceeded, 'boolean');
  });

  it('respects overridden RETRY_THRESHOLD of 2', async () => {
    // simulate threshold=2: count=2 should NOT appear, count=3 SHOULD
    const { getAlerts } = await import('./retryAlerts.js');
    setRunCount('LOW-1', 2);
    setRunCount('LOW-2', 3);
    const alerts = getAlerts(2);
    assert.equal(alerts.length, 1);
    assert.equal(alerts[0].issue_key, 'LOW-2');
    assert.equal(alerts[0].run_count, 3);
    assert.equal(alerts[0].threshold_exceeded, true);
  });
});

describe('GET /dashboard', () => {
  it('returns 200 with HTML content-type', async () => {
    const res = await fetch(`${BASE}/dashboard`);
    assert.equal(res.status, 200);
    assert.ok(res.headers.get('content-type')?.includes('text/html'));
  });

  it('response body contains HTML content', async () => {
    const res = await fetch(`${BASE}/dashboard`);
    const body = await res.text();
    assert.ok(body.includes('<html'), 'missing html tag');
  });
});
