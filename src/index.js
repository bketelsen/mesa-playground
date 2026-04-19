// Simple HTTP server — mesa agents can extend this
import { createServer } from 'node:http';
import { sendError } from './errors.js';
import { usersRouter } from './users.js';

const PORT = process.env.PORT || 3000;

const server = createServer(async (req, res) => {
  try {
    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() }));
      return;
    }

    if (req.url?.startsWith('/api/users')) {
      await usersRouter(req, res);
      return;
    }

    sendError(res, 404, 'Not Found');
  } catch (err) {
    console.error('Unhandled error:', err);
    sendError(res, 500, 'Internal Server Error');
  }
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

export { server };
