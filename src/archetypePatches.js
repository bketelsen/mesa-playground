import { randomBytes } from 'node:crypto';

// Append-only patch audit store — records every state transition for archetype patches.
// Patches are immutable once recorded; status changes create new audit events on the same patch record.

const patches = new Map();      // patchId → patch record
const archetypeIndex = new Map(); // archetypeId → Set<patchId>

const VALID_STATUSES = new Set(['proposed', 'approved', 'rejected', 'deployed', 'reverted', 'failed']);

function generateId() {
  return randomBytes(8).toString('hex');
}

function nowISO() {
  return new Date().toISOString();
}

/**
 * Propose a new patch against an archetype.
 * Returns the created patch record.
 */
function proposePatch({ archetype_id, archetype_version, proposed_by, description, patch_data, reason }) {
  if (!archetype_id || !proposed_by || !description) {
    return { ok: false, error: 'missing_required_fields' };
  }

  const id = generateId();
  const patch = {
    id,
    archetype_id,
    archetype_version: archetype_version ?? null,
    description,
    patch_data: patch_data ?? null,
    reason: reason ?? null,
    status: 'proposed',
    proposed_at: nowISO(),
    proposed_by,
    approved_at: null,
    approved_by: null,
    rejected_at: null,
    rejected_by: null,
    rejection_reason: null,
    deployed_at: null,
    reverted_at: null,
    failed_at: null,
    failed_by: null,
    failure_reason: null,
    history: [],
  };

  patches.set(id, patch);

  if (!archetypeIndex.has(archetype_id)) {
    archetypeIndex.set(archetype_id, new Set());
  }
  archetypeIndex.get(archetype_id).add(id);

  return { ok: true, patch: sanitize(patch) };
}

/**
 * Transition a patch to a new status.
 * Immutable audit trail: each transition is appended to patch.history.
 */
function transitionPatch(id, { status, actor, reason }) {
  const patch = patches.get(id);
  if (!patch) return { ok: false, error: 'not_found' };
  if (!VALID_STATUSES.has(status)) return { ok: false, error: 'invalid_status' };

  const allowedTransitions = {
    proposed: ['approved', 'rejected'],
    approved: ['deployed', 'rejected', 'failed'],
    rejected: [],
    deployed: ['reverted'],
    reverted: [],
    failed: [],
  };

  if (!allowedTransitions[patch.status]?.includes(status)) {
    return { ok: false, error: 'invalid_transition', from: patch.status, to: status };
  }

  const ts = nowISO();

  // Snapshot current state into history before mutating (append-only, immutable audit trail)
  const snapshotActor = patch.status === 'proposed' ? patch.proposed_by
    : patch.status === 'approved' ? patch.approved_by
    : patch.status === 'rejected' ? patch.rejected_by
    : patch.status === 'deployed' ? 'ci'
    : null;
  const snapshotAt = patch.status === 'proposed' ? patch.proposed_at
    : patch.status === 'approved' ? patch.approved_at
    : patch.status === 'rejected' ? patch.rejected_at
    : patch.status === 'deployed' ? patch.deployed_at
    : null;
  patch.history.push({ status: patch.status, actor: snapshotActor, at: snapshotAt });

  // Apply transition timestamps
  if (status === 'approved') {
    patch.approved_at = ts;
    patch.approved_by = actor;
  } else if (status === 'rejected') {
    patch.rejected_at = ts;
    patch.rejected_by = actor;
    patch.rejection_reason = reason ?? null;
  } else if (status === 'deployed') {
    patch.deployed_at = ts;
  } else if (status === 'reverted') {
    patch.reverted_at = ts;
  } else if (status === 'failed') {
    patch.failed_at = ts;
    patch.failed_by = actor;
    patch.failure_reason = reason ?? null;
  }

  patch.status = status;

  return { ok: true, patch: sanitize(patch) };
}

/**
 * List all patches, optionally filtered by status and/or archetype_id.
 */
function listPatches({ status, archetype_id } = {}) {
  let result = Array.from(patches.values());

  if (archetype_id) {
    result = result.filter(p => p.archetype_id === archetype_id);
  }

  if (status) {
    const statuses = status.split(',').map(s => s.trim()).filter(Boolean);
    result = result.filter(p => statuses.includes(p.status));
  }

  return result.map(sanitize);
}

/**
 * Return currently active (deployed) patches for a given archetype_id.
 */
function getActivePatches(archetype_id) {
  const ids = archetypeIndex.get(archetype_id);
  if (!ids) return [];
  return Array.from(ids)
    .map(id => patches.get(id))
    .filter(p => p && p.status === 'deployed')
    .map(sanitize);
}

/**
 * Get a single patch by id.
 */
function getPatch(id) {
  const p = patches.get(id);
  return p ? sanitize(p) : null;
}

function sanitize(patch) {
  // Return a shallow copy so internal history array cannot be mutated externally
  return { ...patch, history: [...patch.history] };
}

// Expose internals for testing only
function _reset() {
  patches.clear();
  archetypeIndex.clear();
}

export { proposePatch, transitionPatch, listPatches, getActivePatches, getPatch, VALID_STATUSES, _reset };
