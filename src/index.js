// Simple HTTP server — mesa agents can extend this
import { createServer } from 'node:http';
import { sendError } from './errors.js';
import { usersRouter } from './users.js';
import { workBlocksRouter } from './workblocksRouter.js';
import { rateLimiter } from './ratelimit.js';
import { incrementRequests, trackConnections, getMetrics } from './metrics.js';
import { PORT, DRAIN_TIMEOUT_MS } from './config.js';
import { logger } from './logger.js';
import { getAlerts } from './retryAlerts.js';
import { correlationId } from './requestContext.js';

let isShuttingDown = false;

const server = createServer(correlationId(rateLimiter(async (req, res) => {
  incrementRequests();
  try {
    if (req.url === '/readiness') {
      if (isShuttingDown) {
        res.writeHead(503, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'draining' }));
      } else {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ready' }));
      }
      return;
    }

    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', timestamp: new Date().toISOString(), ...getMetrics() }));
      return;
    }

    if (req.url?.startsWith('/api/users')) {
      await usersRouter(req, res);
      return;
    }

    if (req.url?.startsWith('/api/workblocks')) {
      await workBlocksRouter(req, res);
      return;
    }

    if (req.url === '/api/v1/retry-alerts') {
      const alerts = getAlerts();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(alerts));
      return;
    }

    if (req.url === '/dashboard') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`<!DOCTYPE html><html><head><title>Dashboard</title></head><body><h1>Mesa Dashboard</h1></body></html>`);
      return;
    }

    sendError(res, 404, 'Not Found');
  } catch (err) {
    logger.error({ err }, 'Unhandled error');
    sendError(res, 500, 'Internal Server Error');
  }
})));

trackConnections(server);

function shutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  logger.info({ signal }, 'Graceful shutdown initiated');

  server.close(() => {
    logger.info('All connections drained; exiting');
    process.exit(0);
  });

  setTimeout(() => {
    logger.warn({ drainTimeoutMs: DRAIN_TIMEOUT_MS }, 'Drain timeout reached; forcing exit');
    process.exit(1);
  }, DRAIN_TIMEOUT_MS).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

server.listen(PORT, () => {
  logger.info({ port: PORT }, 'Server running');
});

export { server, isShuttingDown };
