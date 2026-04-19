import { RETRY_THRESHOLD } from './config.js';

const SO_API_URL = process.env.MESA_API_URL ?? 'http://localhost:3099';
const SO_API_KEY = process.env.MESA_API_KEY ?? '';

async function fetchIssues(fetcher = fetch) {
  const res = await fetcher(`${SO_API_URL}/api/v1/inbox`, {
    headers: { Authorization: `Bearer ${SO_API_KEY}` },
  });
  if (!res.ok) throw new Error(`SO API error: ${res.status}`);
  return res.json();
}

async function getRetryAlerts(threshold = RETRY_THRESHOLD, fetcher = fetch) {
  const issues = await fetchIssues(fetcher);
  return issues
    .map(issue => ({
      issue_key: issue.key,
      run_count: Array.isArray(issue.stages) ? issue.stages.length : 0,
    }))
    .filter(item => item.run_count > threshold)
    .map(item => ({ ...item, threshold_exceeded: true }));
}

export { getRetryAlerts, fetchIssues };
