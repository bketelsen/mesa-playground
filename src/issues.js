const HIGH_RETRY_THRESHOLD = 3;

// key -> { key, title, assignee, status, run_count }
const issues = new Map();

function upsertIssue({ key, title, assignee = null, status = 'open', run_count = 0 }) {
  const existing = issues.get(key) ?? {};
  issues.set(key, { key, title, assignee, status, run_count, ...existing, key });
}

function recordRun(key) {
  const issue = issues.get(key);
  if (!issue) return;
  issue.run_count = (issue.run_count ?? 0) + 1;
}

function setRunCount(key, count) {
  const issue = issues.get(key);
  if (!issue) return;
  issue.run_count = count;
}

function getIssues() {
  return Array.from(issues.values()).map(issue => ({
    ...issue,
    high_retry: issue.run_count >= HIGH_RETRY_THRESHOLD,
  }));
}

function getHighRetryIssues() {
  return getIssues().filter(i => i.high_retry);
}

function reset() {
  issues.clear();
}

export { upsertIssue, recordRun, setRunCount, getIssues, getHighRetryIssues, reset, HIGH_RETRY_THRESHOLD };
