import { createUser, getUser, listUsers, updateUser, deleteUser } from './store.js';
import { validateUser, validatePartialUser } from './validation.js';
import { sendError } from './errors.js';
import { requireAuth } from './auth.js';

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

async function usersRouter(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const parts = url.pathname.replace(/^\/api\/users/, '').split('/').filter(Boolean);
  const id = parts[0];

  if (!id && req.method === 'GET') {
    return json(res, 200, listUsers());
  }

  if (!id && req.method === 'POST') {
    let body;
    try { body = await parseBody(req); }
    catch { return sendError(res, 400, 'Invalid JSON'); }
    const validation = validateUser(body);
    if (!validation.valid) {
      return sendError(res, 400, validation.errors.join(', '));
    }
    return json(res, 201, createUser(body));
  }

  if (id && req.method === 'GET') {
    const user = getUser(id);
    if (!user) return sendError(res, 404, 'User not found');
    return json(res, 200, user);
  }

  if (id && req.method === 'PUT') {
    if (!requireAuth(req, res, id)) return;
    let body;
    try { body = await parseBody(req); }
    catch { return sendError(res, 400, 'Invalid JSON'); }
    const validation = validatePartialUser(body);
    if (!validation.valid) {
      return sendError(res, 400, validation.errors.join(', '));
    }
    const user = updateUser(id, body);
    if (!user) return sendError(res, 404, 'User not found');
    return json(res, 200, user);
  }

  if (id && req.method === 'DELETE') {
    if (!requireAuth(req, res, id)) return;
    const existed = deleteUser(id);
    if (!existed) return sendError(res, 404, 'User not found');
    return json(res, 200, { deleted: true });
  }

  sendError(res, 404, 'Not Found');
}

export { usersRouter };
