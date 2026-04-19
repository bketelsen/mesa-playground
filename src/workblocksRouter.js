import {
  createWorkBlock,
  getWorkBlock,
  listWorkBlocks,
  patchWorkBlock,
  linkIssue,
  checkAndAutoClose,
  getWorkBlockForIssue,
  getIssueStatuses,
  setIssueStatus,
  getIssueStatusMap,
} from './workblocks.js';
import { sendError } from './errors.js';

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', chunk => { raw += chunk; });
    req.on('end', () => {
      try { resolve(raw ? JSON.parse(raw) : {}); }
      catch { reject(new Error('Invalid JSON')); }
    });
    req.on('error', reject);
  });
}

function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

async function workBlocksRouter(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const parts = url.pathname.replace(/^\/api\/workblocks/, '').split('/').filter(Boolean);
  const id = parts[0];
  const sub = parts[1]; // e.g. "issues"

  // GET /api/workblocks
  if (!id && req.method === 'GET') {
    return json(res, 200, listWorkBlocks());
  }

  // POST /api/workblocks
  if (!id && req.method === 'POST') {
    let body;
    try { body = await parseBody(req); }
    catch { return sendError(res, 400, 'Invalid JSON'); }
    if (!body.title || typeof body.title !== 'string') {
      return sendError(res, 400, 'title is required');
    }
    return json(res, 201, createWorkBlock(body));
  }

  // GET /api/workblocks/:id
  if (id && !sub && req.method === 'GET') {
    const block = getWorkBlock(id);
    if (!block) return sendError(res, 404, 'Work block not found');
    return json(res, 200, block);
  }

  // PATCH /api/workblocks/:id — manual status transition
  if (id && !sub && req.method === 'PATCH') {
    let body;
    try { body = await parseBody(req); }
    catch { return sendError(res, 400, 'Invalid JSON'); }
    const result = patchWorkBlock(id, body);
    if (!result.ok) {
      if (result.error === 'not_found') return sendError(res, 404, 'Work block not found');
      if (result.error === 'invalid_status') return sendError(res, 400, 'Invalid status value');
      if (result.error === 'invalid_transition') return sendError(res, 422, 'Invalid status transition');
    }
    return json(res, 200, result.block);
  }

  // POST /api/workblocks/:id/issues — link an issue and optionally report its status
  if (id && sub === 'issues' && req.method === 'POST') {
    let body;
    try { body = await parseBody(req); }
    catch { return sendError(res, 400, 'Invalid JSON'); }
    if (!body.issueId || typeof body.issueId !== 'string') {
      return sendError(res, 400, 'issueId is required');
    }
    const ok = linkIssue(id, body.issueId);
    if (!ok) return sendError(res, 404, 'Work block not found');
    return json(res, 200, { linked: true });
  }

  // PATCH /api/workblocks/:id/issues/:issueId — update issue status, trigger auto-close check
  if (id && sub === 'issues' && parts[2] && req.method === 'PATCH') {
    const issueId = parts[2];
    let body;
    try { body = await parseBody(req); }
    catch { return sendError(res, 400, 'Invalid JSON'); }
    if (!body.status || typeof body.status !== 'string') {
      return sendError(res, 400, 'status is required');
    }

    const block = getWorkBlock(id);
    if (!block) return sendError(res, 404, 'Work block not found');

    // Persist this issue's new status
    setIssueStatus(issueId, body.status);

    // Build current issue statuses map from stored state
    const statusMap = getIssueStatusMap(id);

    const autoClosedBlock = checkAndAutoClose(id, statusMap);

    return json(res, 200, {
      issueId,
      status: body.status,
      workBlock: autoClosedBlock ?? block,
      autoCompleted: autoClosedBlock !== null,
    });
  }

  sendError(res, 404, 'Not Found');
}

// issueStatusChanged: call when an issue transitions to 'done' anywhere in the system.
// Looks up the parent work block and triggers auto-close if all issues are done.
function issueStatusChanged(issueId, newStatus, getIssueStatus) {
  if (newStatus !== 'done') return null;

  const block = getWorkBlockForIssue(issueId);
  if (!block) return null;

  const linkedIssues = getIssueStatuses(block.id);
  const statusMap = new Map(
    Array.from(linkedIssues).map(iid => [iid, iid === issueId ? 'done' : (getIssueStatus(iid) ?? 'open')])
  );

  return checkAndAutoClose(block.id, statusMap);
}

export { workBlocksRouter, issueStatusChanged };
