const metrics = {
  requestCount: 0,
  activeConnections: 0,
};

export function incrementRequests() {
  metrics.requestCount++;
}

export function trackConnections(server) {
  server.on('connection', (socket) => {
    metrics.activeConnections++;
    socket.on('close', () => {
      metrics.activeConnections--;
    });
  });
}

export function getMetrics() {
  return {
    uptime: process.uptime(),
    requestCount: metrics.requestCount,
    activeConnections: metrics.activeConnections,
  };
}
