// Simple HTTP server — mesa agents can extend this
import { createServer } from 'node:http';
import { requestLogger } from './middleware.js';

const PORT = process.env.PORT || 3000;

const handler = (req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() }));
    return;
  }

  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Mesa Playground');
};

const server = createServer(requestLogger(handler));

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

export { server };
