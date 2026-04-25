import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { proposePatch, transitionPatch, listPatches, getActivePatches, getPatch, _reset } from './archetypePatches.js';

beforeEach(() => _reset());

describe('proposePatch', () => {
  it('creates a patch with proposed status', () => {
    const { ok, patch } = proposePatch({
      archetype_id: 'backend',
      archetype_version: '1.0.0',
      proposed_by: 'alice',
      description: 'Add linting guidance',
      reason: 'reduce lint errors',
    });
    assert.equal(ok, true);
    assert.equal(patch.status, 'proposed');
    assert.equal(patch.archetype_id, 'backend');
    assert.ok(patch.proposed_at);
    assert.equal(patch.proposed_by, 'alice');
    assert.equal(patch.approved_at, null);
    assert.equal(patch.deployed_at, null);
  });

  it('rejects missing required fields', () => {
    const { ok, error } = proposePatch({ proposed_by: 'alice', description: 'x' });
    assert.equal(ok, false);
    assert.equal(error, 'missing_required_fields');
  });
});

describe('transitionPatch', () => {
  it('approves a proposed patch', () => {
    const { patch: p } = proposePatch({ archetype_id: 'a1', proposed_by: 'alice', description: 'd' });
    const { ok, patch } = transitionPatch(p.id, { status: 'approved', actor: 'bob' });
    assert.equal(ok, true);
    assert.equal(patch.status, 'approved');
    assert.equal(patch.approved_by, 'bob');
    assert.ok(patch.approved_at);
  });

  it('rejects an invalid transition', () => {
    const { patch: p } = proposePatch({ archetype_id: 'a1', proposed_by: 'alice', description: 'd' });
    const result = transitionPatch(p.id, { status: 'deployed', actor: 'bob' });
    assert.equal(result.ok, false);
    assert.equal(result.error, 'invalid_transition');
  });

  it('records history on transition', () => {
    const { patch: p } = proposePatch({ archetype_id: 'a1', proposed_by: 'alice', description: 'd' });
    transitionPatch(p.id, { status: 'approved', actor: 'bob' });
    const updated = getPatch(p.id);
    assert.equal(updated.history.length, 1);
    assert.equal(updated.history[0].status, 'proposed');
  });

  it('returns not_found for unknown patch', () => {
    const result = transitionPatch('nope', { status: 'approved', actor: 'x' });
    assert.equal(result.ok, false);
    assert.equal(result.error, 'not_found');
  });

  it('full lifecycle: proposed → approved → deployed', () => {
    const { patch: p } = proposePatch({ archetype_id: 'a1', proposed_by: 'alice', description: 'd' });
    transitionPatch(p.id, { status: 'approved', actor: 'bob' });
    const { ok, patch } = transitionPatch(p.id, { status: 'deployed', actor: 'ci' });
    assert.equal(ok, true);
    assert.equal(patch.status, 'deployed');
    assert.ok(patch.deployed_at);
  });

  it('records rejection reason', () => {
    const { patch: p } = proposePatch({ archetype_id: 'a1', proposed_by: 'alice', description: 'd' });
    const { patch } = transitionPatch(p.id, { status: 'rejected', actor: 'bob', reason: 'not needed' });
    assert.equal(patch.rejection_reason, 'not needed');
    assert.equal(patch.rejected_by, 'bob');
  });
});

describe('listPatches', () => {
  it('returns all patches without filter', () => {
    proposePatch({ archetype_id: 'a1', proposed_by: 'alice', description: 'd1' });
    proposePatch({ archetype_id: 'a2', proposed_by: 'bob', description: 'd2' });
    assert.equal(listPatches().length, 2);
  });

  it('filters by status', () => {
    const { patch: p1 } = proposePatch({ archetype_id: 'a1', proposed_by: 'alice', description: 'd1' });
    proposePatch({ archetype_id: 'a1', proposed_by: 'alice', description: 'd2' });
    transitionPatch(p1.id, { status: 'approved', actor: 'bob' });
    const approved = listPatches({ status: 'approved' });
    assert.equal(approved.length, 1);
    assert.equal(approved[0].id, p1.id);
  });

  it('filters by archetype_id', () => {
    proposePatch({ archetype_id: 'a1', proposed_by: 'alice', description: 'd1' });
    proposePatch({ archetype_id: 'a2', proposed_by: 'alice', description: 'd2' });
    assert.equal(listPatches({ archetype_id: 'a1' }).length, 1);
  });

  it('filters by comma-separated statuses', () => {
    const { patch: p1 } = proposePatch({ archetype_id: 'a1', proposed_by: 'alice', description: 'd1' });
    const { patch: p2 } = proposePatch({ archetype_id: 'a1', proposed_by: 'alice', description: 'd2' });
    transitionPatch(p1.id, { status: 'approved', actor: 'bob' });
    transitionPatch(p2.id, { status: 'rejected', actor: 'bob' });
    const result = listPatches({ status: 'approved,rejected' });
    assert.equal(result.length, 2);
  });
});

describe('getActivePatches', () => {
  it('returns only deployed patches for archetype', () => {
    const { patch: p1 } = proposePatch({ archetype_id: 'a1', proposed_by: 'alice', description: 'd1' });
    const { patch: p2 } = proposePatch({ archetype_id: 'a1', proposed_by: 'alice', description: 'd2' });
    transitionPatch(p1.id, { status: 'approved', actor: 'bob' });
    transitionPatch(p1.id, { status: 'deployed', actor: 'ci' });
    // p2 stays proposed
    const active = getActivePatches('a1');
    assert.equal(active.length, 1);
    assert.equal(active[0].id, p1.id);
  });

  it('returns empty for unknown archetype', () => {
    assert.deepEqual(getActivePatches('unknown'), []);
  });
});
