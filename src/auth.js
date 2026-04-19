import { getUserByToken } from './store.js';
import { sendError } from './errors.js';

function requireAuth(req, res, userId) {
  const header = req.headers['authorization'] ?? '';
  const match = header.match(/^Bearer\s+(\S+)$/i);
  if (!match) {
    sendError(res, 401, 'Missing or invalid Authorization header');
    return null;
  }

  const token = match[1];
  const tokenUser = getUserByToken(token);
  if (!tokenUser) {
    sendError(res, 401, 'Invalid token');
    return null;
  }

  if (tokenUser.id !== userId) {
    sendError(res, 403, 'Forbidden');
    return null;
  }

  return tokenUser;
}

export { requireAuth };
