import { RETRY_THRESHOLD } from './config.js';

// issueKey -> run count
const runCounts = new Map();

function recordRun(issueKey) {
  runCounts.set(issueKey, (runCounts.get(issueKey) ?? 0) + 1);
}

function setRunCount(issueKey, count) {
  runCounts.set(issueKey, count);
}

function getAlerts(threshold = RETRY_THRESHOLD) {
  const results = [];
  for (const [issue_key, run_count] of runCounts) {
    if (run_count > threshold) {
      results.push({ issue_key, run_count, threshold_exceeded: true });
    }
  }
  return results;
}

function reset() {
  runCounts.clear();
}

export { recordRun, setRunCount, getAlerts, reset };
