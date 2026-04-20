/**
 * Acceptance tests for SO-21: CEO escalation alert at run threshold.
 *
 * Verifies all acceptance criteria from the issue:
 *   AC1. Alert fires exactly at run 5, not before or after
 *   AC2. Alert does not re-fire on runs 6, 7, etc. (no spam)
 *   AC3. Closed/resolved issues are excluded from triggering alerts
 *   AC4. CEO receives correct notification content (key, title, run_count, recommendation)
 *   AC5. Issue re-opened after close does not reset count incorrectly
 */
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { getAlerts, setRunCount, reset as retryReset } from './retryAlerts.js';
import { upsertIssue, reset as issuesReset } from './issues.js';

const ESCALATION_THRESHOLD = 5; // AC: fires at run 5

function setup(key, title, status, runCount) {
  upsertIssue({ key, title, status, run_count: 0 });
  setRunCount(key, runCount);
}

beforeEach(() => {
  retryReset();
  issuesReset();
});

// ---------------------------------------------------------------------------
// AC1: Alert fires exactly at run 5, not before or after
// ---------------------------------------------------------------------------
describe('AC1: alert fires exactly at run 5', () => {
  it('does NOT fire for run 1', () => {
    setup('AC1-A', 'Test Issue A', 'open', 1);
    const alerts = getAlerts(ESCALATION_THRESHOLD - 1);
    assert.equal(alerts.length, 0, 'run 1 should not trigger alert');
  });

  it('does NOT fire for run 4', () => {
    setup('AC1-B', 'Test Issue B', 'open', 4);
    const alerts = getAlerts(ESCALATION_THRESHOLD - 1);
    assert.equal(alerts.length, 0, 'run 4 should not trigger alert');
  });

  it('fires at exactly run 5', () => {
    setup('AC1-C', 'Test Issue C', 'open', 5);
    const alerts = getAlerts(ESCALATION_THRESHOLD - 1);
    assert.equal(alerts.length, 1, 'run 5 should trigger alert');
    assert.equal(alerts[0].issue_key, 'AC1-C');
    assert.equal(alerts[0].run_count, 5);
  });

  it('also fires for run 6 (still over threshold)', () => {
    setup('AC1-D', 'Test Issue D', 'open', 6);
    const alerts = getAlerts(ESCALATION_THRESHOLD - 1);
    assert.equal(alerts.length, 1);
    assert.equal(alerts[0].run_count, 6);
  });
});

// ---------------------------------------------------------------------------
// AC2: Alert does not re-fire on runs 6, 7, etc. (no spam)
// ---------------------------------------------------------------------------
describe('AC2: alert does not re-fire after threshold is crossed', () => {
  it('getAlerts() called twice with same count returns same alert — demonstrates no idempotency guard', () => {
    setup('AC2-A', 'Test Issue', 'open', 5);
    const first = getAlerts(ESCALATION_THRESHOLD - 1);
    const second = getAlerts(ESCALATION_THRESHOLD - 1);
    // If there is a "sent" guard, the second call should return empty.
    // Currently this FAILS — both calls return the same alert (re-fire bug).
    assert.equal(second.length, 0, 'second call to getAlerts() after alert was sent should return empty (idempotency)');
  });
});

// ---------------------------------------------------------------------------
// AC3: Closed/resolved issues are excluded
// ---------------------------------------------------------------------------
describe('AC3: closed/resolved issues excluded from alerts', () => {
  it('closed issue with run_count > threshold is NOT alerted', () => {
    setup('AC3-A', 'Closed Issue', 'closed', 6);
    const alerts = getAlerts(ESCALATION_THRESHOLD - 1);
    assert.equal(alerts.length, 0, 'closed issue should not appear in alerts');
  });

  it('resolved issue with run_count > threshold is NOT alerted', () => {
    setup('AC3-B', 'Resolved Issue', 'resolved', 6);
    const alerts = getAlerts(ESCALATION_THRESHOLD - 1);
    assert.equal(alerts.length, 0, 'resolved issue should not appear in alerts');
  });

  it('done issue with run_count > threshold is NOT alerted', () => {
    setup('AC3-C', 'Done Issue', 'done', 6);
    const alerts = getAlerts(ESCALATION_THRESHOLD - 1);
    assert.equal(alerts.length, 0, 'done issue should not appear in alerts');
  });

  it('open issue with run_count > threshold IS alerted', () => {
    setup('AC3-D', 'Open Issue', 'open', 6);
    const alerts = getAlerts(ESCALATION_THRESHOLD - 1);
    assert.equal(alerts.length, 1, 'open issue should appear in alerts');
  });

  it('in_progress issue with run_count > threshold IS alerted', () => {
    setup('AC3-E', 'In Progress Issue', 'in_progress', 6);
    const alerts = getAlerts(ESCALATION_THRESHOLD - 1);
    assert.equal(alerts.length, 1, 'in_progress issue should appear in alerts');
  });
});

// ---------------------------------------------------------------------------
// AC4: Alert notification includes issue key, title, run count, recommendation
// ---------------------------------------------------------------------------
describe('AC4: notification content is correct', () => {
  it('alert includes issue_key', () => {
    setup('AC4-A', 'My Feature Issue', 'open', 5);
    const alerts = getAlerts(ESCALATION_THRESHOLD - 1);
    assert.equal(alerts.length, 1);
    assert.equal(alerts[0].issue_key, 'AC4-A');
  });

  it('alert includes title', () => {
    setup('AC4-B', 'My Feature Issue', 'open', 5);
    const alerts = getAlerts(ESCALATION_THRESHOLD - 1);
    assert.equal(alerts.length, 1);
    assert.ok('title' in alerts[0], 'alert must include title field');
    assert.equal(alerts[0].title, 'My Feature Issue');
  });

  it('alert includes run_count', () => {
    setup('AC4-C', 'Some Issue', 'open', 5);
    const alerts = getAlerts(ESCALATION_THRESHOLD - 1);
    assert.equal(alerts.length, 1);
    assert.equal(alerts[0].run_count, 5);
  });

  it('alert includes recommendation', () => {
    setup('AC4-D', 'Some Issue', 'open', 5);
    const alerts = getAlerts(ESCALATION_THRESHOLD - 1);
    assert.equal(alerts.length, 1);
    assert.ok('recommendation' in alerts[0], 'alert must include recommendation field');
    assert.equal(typeof alerts[0].recommendation, 'string');
    assert.ok(alerts[0].recommendation.length > 0, 'recommendation must be non-empty');
  });
});

// ---------------------------------------------------------------------------
// AC5: Issue re-opened after close does not reset count incorrectly
// ---------------------------------------------------------------------------
describe('AC5: re-opened issue run count is preserved', () => {
  it('closing and re-opening an issue preserves run_count', () => {
    setup('AC5-A', 'Reopened Issue', 'open', 5);
    // Close the issue
    upsertIssue({ key: 'AC5-A', title: 'Reopened Issue', status: 'closed', run_count: 5 });
    // Re-open
    upsertIssue({ key: 'AC5-A', title: 'Reopened Issue', status: 'open', run_count: 5 });
    const alerts = getAlerts(ESCALATION_THRESHOLD - 1);
    assert.equal(alerts.length, 1, 'run count should still exceed threshold after re-open');
    assert.equal(alerts[0].run_count, 5, 'run count must not be reset on re-open');
  });

  it('re-opened issue with count still below threshold does not alert', () => {
    setup('AC5-B', 'Low Count Reopened', 'open', 3);
    upsertIssue({ key: 'AC5-B', title: 'Low Count Reopened', status: 'closed', run_count: 3 });
    upsertIssue({ key: 'AC5-B', title: 'Low Count Reopened', status: 'open', run_count: 3 });
    const alerts = getAlerts(ESCALATION_THRESHOLD - 1);
    assert.equal(alerts.length, 0, 'run count still below threshold after re-open — should not alert');
  });
});
