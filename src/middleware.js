// Request logging middleware — wraps an HTTP handler and logs each request
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
      console.log(JSON.stringify({
        timestamp: new Date().toISOString(),
        method,
        url,
        status: statusCode,
        responseTime: ms,
      }));
    });

    handler(req, res);
  };
}
