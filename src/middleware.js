// Request logging middleware — wraps an HTTP handler and logs each request
import { logger } from './logger.js';

export function requestLogger(handler) {
  return (req, res) => {
    const start = Date.now();
    const { method, url } = req;

    const originalWriteHead = res.writeHead.bind(res);
    let statusCode = 200;
    res.writeHead = (code, ...args) => {
      statusCode = code;
      return originalWriteHead(code, ...args);
    };

    res.on('finish', () => {
      const ms = Date.now() - start;
      const log = req.log ?? logger;
      log.info({ method, url, status: statusCode, responseTime: ms });
    });

    handler(req, res);
  };
}
