import { sendError } from './errors.js';
import { RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS } from './config.js';

const WINDOW_MS = RATE_LIMIT_WINDOW_MS;
const MAX_REQUESTS = RATE_LIMIT_MAX;

const store = new Map(); // ip -> { count, windowStart }

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) return forwarded.split(',')[0].trim();
  return req.socket?.remoteAddress ?? '127.0.0.1';
}

export function rateLimiter(handler) {
  return (req, res) => {
    const ip = getClientIp(req);
    const now = Date.now();
    const entry = store.get(ip);

    if (!entry || now - entry.windowStart >= WINDOW_MS) {
      store.set(ip, { count: 1, windowStart: now });
      return handler(req, res);
    }

    entry.count += 1;

    if (entry.count > MAX_REQUESTS) {
      const retryAfter = Math.ceil((entry.windowStart + WINDOW_MS - now) / 1000);
      res.writeHead(429, {
        'Content-Type': 'application/json',
        'Retry-After': String(retryAfter),
        'X-RateLimit-Limit': String(MAX_REQUESTS),
        'X-RateLimit-Remaining': '0',
        'X-RateLimit-Reset': String(Math.ceil((entry.windowStart + WINDOW_MS) / 1000)),
      });
      res.end(JSON.stringify({ error: 'Too Many Requests' }));
      return;
    }

    return handler(req, res);
  };
}

export { WINDOW_MS, MAX_REQUESTS };
