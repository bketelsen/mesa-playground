import { proposePatch, transitionPatch, listPatches, getActivePatches, getPatch } from './archetypePatches.js';
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

// Routes handled:
//   GET  /api/v1/archetypes/patches                  — list all patches (status filter via ?status=)
//   POST /api/v1/archetypes/patches                  — propose a new patch
//   GET  /api/v1/archetypes/patches/:patchId          — get single patch
//   POST /api/v1/archetypes/patches/:patchId/transition — transition patch status
//   GET  /api/v1/archetypes/:id/active-patches         — active (deployed) patches for an archetype
async function archetypePatchesRouter(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const path = url.pathname;

  // GET /api/v1/archetypes/:id/active-patches
  const activeMatch = path.match(/^\/api\/v1\/archetypes\/([^/]+)\/active-patches$/);
  if (activeMatch && req.method === 'GET') {
    const archetypeId = activeMatch[1];
    return json(res, 200, getActivePatches(archetypeId));
  }

  // Routes under /api/v1/archetypes/patches
  const patchesBase = '/api/v1/archetypes/patches';

  if (!path.startsWith(patchesBase)) {
    return sendError(res, 404, 'Not Found');
  }

  const rest = path.slice(patchesBase.length); // '' | '/:id' | '/:id/transition'
  const parts = rest.split('/').filter(Boolean);
  const patchId = parts[0];
  const sub = parts[1];

  // GET /api/v1/archetypes/patches
  if (!patchId && req.method === 'GET') {
    const status = url.searchParams.get('status') ?? undefined;
    const archetype_id = url.searchParams.get('archetype_id') ?? undefined;
    return json(res, 200, listPatches({ status, archetype_id }));
  }

  // POST /api/v1/archetypes/patches
  if (!patchId && req.method === 'POST') {
    let body;
    try { body = await parseBody(req); }
    catch { return sendError(res, 400, 'Invalid JSON'); }

    const result = proposePatch(body);
    if (!result.ok) {
      return sendError(res, 400, result.error === 'missing_required_fields'
        ? 'archetype_id, proposed_by, and description are required'
        : result.error);
    }
    return json(res, 201, result.patch);
  }

  // GET /api/v1/archetypes/patches/:patchId
  if (patchId && !sub && req.method === 'GET') {
    const patch = getPatch(patchId);
    if (!patch) return sendError(res, 404, 'Patch not found');
    return json(res, 200, patch);
  }

  // POST /api/v1/archetypes/patches/:patchId/approve
  if (patchId && sub === 'approve' && req.method === 'POST') {
    let body;
    try { body = await parseBody(req); }
    catch { return sendError(res, 400, 'Invalid JSON'); }

    const actor = body.actor ?? 'unknown';

    // Transition proposed → approved
    const approveResult = transitionPatch(patchId, { status: 'approved', actor });
    if (!approveResult.ok) {
      if (approveResult.error === 'not_found') return sendError(res, 404, 'Patch not found');
      if (approveResult.error === 'invalid_transition') {
        return sendError(res, 409, 'Patch is not in pending state');
      }
      return sendError(res, 400, approveResult.error);
    }

    // Immediately deploy (apply to live archetype)
    const deployResult = transitionPatch(patchId, { status: 'deployed', actor });
    if (!deployResult.ok) {
      return sendError(res, 500, 'Patch approved but deployment failed');
    }

    return json(res, 200, deployResult.patch);
  }

  // POST /api/v1/archetypes/patches/:patchId/reject
  if (patchId && sub === 'reject' && req.method === 'POST') {
    let body;
    try { body = await parseBody(req); }
    catch { return sendError(res, 400, 'Invalid JSON'); }

    const actor = body.actor ?? 'unknown';
    const reason = body.reason ?? null;

    const result = transitionPatch(patchId, { status: 'rejected', actor, reason });
    if (!result.ok) {
      if (result.error === 'not_found') return sendError(res, 404, 'Patch not found');
      if (result.error === 'invalid_transition') {
        return sendError(res, 409, 'Patch is not in pending state');
      }
      return sendError(res, 400, result.error);
    }
    return json(res, 200, result.patch);
  }

  // POST /api/v1/archetypes/patches/:patchId/transition
  if (patchId && sub === 'transition' && req.method === 'POST') {
    let body;
    try { body = await parseBody(req); }
    catch { return sendError(res, 400, 'Invalid JSON'); }

    if (!body.status || !body.actor) {
      return sendError(res, 400, 'status and actor are required');
    }

    const result = transitionPatch(patchId, body);
    if (!result.ok) {
      if (result.error === 'not_found') return sendError(res, 404, 'Patch not found');
      if (result.error === 'invalid_status') return sendError(res, 400, 'Invalid status value');
      if (result.error === 'invalid_transition') {
        return sendError(res, 422, `Cannot transition from '${result.from}' to '${result.to}'`);
      }
      return sendError(res, 400, result.error);
    }
    return json(res, 200, result.patch);
  }

  sendError(res, 404, 'Not Found');
}

export { archetypePatchesRouter };
