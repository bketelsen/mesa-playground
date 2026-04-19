// Simple HTTP server — mesa agents can extend this
import { createServer } from 'node:http';
import { sendError } from './errors.js';
import { usersRouter } from './users.js';
import { workBlocksRouter } from './workblocksRouter.js';
import { rateLimiter } from './ratelimit.js';
import { incrementRequests, trackConnections, getMetrics } from './metrics.js';
import { PORT } from './config.js';
import { getAlerts } from './retryAlerts.js';

const server = createServer(rateLimiter(async (req, res) => {
  incrementRequests();
  try {
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
    console.error('Unhandled error:', err);
    sendError(res, 500, 'Internal Server Error');
  }
}));

trackConnections(server);

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

export { server };
