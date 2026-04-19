import { randomBytes } from 'node:crypto';

// Valid work block statuses
const VALID_STATUSES = new Set(['ready', 'in_progress', 'complete']);

// Valid status transitions
const ALLOWED_TRANSITIONS = new Map([
  ['ready', new Set(['in_progress', 'complete'])],
  ['in_progress', new Set(['complete'])],
  ['complete', new Set()],
]);

// In-memory work block store
const workBlocks = new Map();
// workBlockId -> Set of issue ids
const issueIndex = new Map();
// issueId -> workBlockId
const issueToBlock = new Map();
// issueId -> status string
const issueStatuses = new Map();

function createWorkBlock(data) {
  const id = randomBytes(8).toString('hex');
  const block = {
    id,
    title: data.title,
    status: 'ready',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  workBlocks.set(id, block);
  issueIndex.set(id, new Set());
  return block;
}

function getWorkBlock(id) {
  return workBlocks.get(id) ?? null;
}

function listWorkBlocks() {
  return Array.from(workBlocks.values());
}

function patchWorkBlock(id, data) {
  const block = workBlocks.get(id);
  if (!block) return { ok: false, error: 'not_found' };

  if (data.status !== undefined) {
    if (!VALID_STATUSES.has(data.status)) {
      return { ok: false, error: 'invalid_status' };
    }
    const allowed = ALLOWED_TRANSITIONS.get(block.status);
    if (!allowed.has(data.status)) {
      return { ok: false, error: 'invalid_transition' };
    }
    block.status = data.status;
  }

  if (data.title !== undefined) block.title = data.title;
  block.updatedAt = new Date().toISOString();
  return { ok: true, block };
}

function linkIssue(workBlockId, issueId) {
  if (!workBlocks.has(workBlockId)) return false;
  issueIndex.get(workBlockId).add(issueId);
  issueToBlock.set(issueId, workBlockId);
  issueStatuses.set(issueId, 'open');
  return true;
}

function unlinkIssue(issueId) {
  const workBlockId = issueToBlock.get(issueId);
  if (!workBlockId) return;
  issueIndex.get(workBlockId)?.delete(issueId);
  issueToBlock.delete(issueId);
}

function getWorkBlockForIssue(issueId) {
  const workBlockId = issueToBlock.get(issueId);
  return workBlockId ? (workBlocks.get(workBlockId) ?? null) : null;
}

function getIssueStatuses(workBlockId) {
  return issueIndex.get(workBlockId) ?? new Set();
}

function setIssueStatus(issueId, status) {
  issueStatuses.set(issueId, status);
}

function getIssueStatusMap(workBlockId) {
  const linked = issueIndex.get(workBlockId);
  if (!linked) return new Map();
  const map = new Map();
  for (const id of linked) {
    map.set(id, issueStatuses.get(id) ?? 'open');
  }
  return map;
}

// issueStatuses: Map<issueId, status string>
function checkAndAutoClose(workBlockId, issueStatuses) {
  const block = workBlocks.get(workBlockId);
  if (!block || block.status === 'complete') return null;

  const linkedIssues = issueIndex.get(workBlockId);
  if (!linkedIssues || linkedIssues.size === 0) return null;

  const allDone = Array.from(linkedIssues).every(id => issueStatuses.get(id) === 'done');
  if (!allDone) return null;

  block.status = 'complete';
  block.updatedAt = new Date().toISOString();
  return block;
}

function reset() {
  workBlocks.clear();
  issueIndex.clear();
  issueToBlock.clear();
  issueStatuses.clear();
}

export {
  createWorkBlock,
  getWorkBlock,
  listWorkBlocks,
  patchWorkBlock,
  linkIssue,
  unlinkIssue,
  getWorkBlockForIssue,
  getIssueStatuses,
  setIssueStatus,
  getIssueStatusMap,
  checkAndAutoClose,
  reset,
};
