import { getIssues, getHighRetryIssues } from './issues.js';
import { sendError } from './errors.js';

async function issuesRouter(req, res) {
  const url = new URL(req.url, 'http://localhost');

  if (req.method === 'GET' && url.pathname === '/api/v1/issues') {
    const highRetryOnly = url.searchParams.get('high_retry') === 'true';
    const data = highRetryOnly ? getHighRetryIssues() : getIssues();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
    return;
  }

  sendError(res, 404, 'Not Found');
}

export { issuesRouter };
