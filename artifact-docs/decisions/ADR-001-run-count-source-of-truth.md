# ADR-001: run_count Source of Truth

**Status:** Accepted  
**Date:** 2026-04-19  
**Issue:** SO-19

## Context

Two independent in-memory stores both track run counts for issues:

| Module | Store | How populated |
|--------|-------|---------------|
| `src/retryAlerts.js` | `Map<issueKey, count>` | `retryAlerts.recordRun(key)` |
| `src/issues.js` | `Map<issueKey, issue{run_count}>` | `issues.recordRun(key)` |

**`board.js`** and **`GET /api/v1/issues`** both read from `issues.js`.  
**`GET /api/v1/retry-alerts`** reads from `retryAlerts.js`.

These stores are updated independently and can diverge if callers invoke one without the other.

> **Note:** The SO-19 issue description states that `board.js` used `retryAlerts.getAllRunCounts()`. As of SO-11, `board.js` was refactored to use `getIssues()` from `issues.js`. The divergence between `board.js` and `/api/v1/issues` no longer exists, but the dual-store problem between `issues.js` and `retryAlerts.js` remains.

## Decision

**`issues.js` is the single source of truth for `run_count`.**

`retryAlerts.js` must be refactored to delegate run-count storage to `issues.js` rather than maintaining its own `Map`. Specifically:

- `retryAlerts.recordRun(key)` → calls `issues.recordRun(key)`
- `retryAlerts.setRunCount(key, count)` → calls `issues.setRunCount(key, count)`
- `retryAlerts.getAllRunCounts()` → reads from `issues.getIssues()` and returns `{ [key]: run_count }`
- `retryAlerts.getAlerts(threshold)` → reads from `issues.getIssues()` and filters by threshold
- The internal `runCounts Map` in `retryAlerts.js` is removed

The public API surface of `retryAlerts.js` is preserved — callers do not need to change.

## Rationale

1. `issues.js` was created in SO-11 specifically as the canonical issue model backing the `/api/v1/issues` REST endpoint. It is the richer model (key, title, assignee, status, run_count) and the one surface area the board UI reads.
2. `retryAlerts.js` is an alerting concern layered on top of run counts — it is a read-mostly consumer, not a source of truth.
3. Eliminating the second store removes the possibility of divergence with zero loss of capability.

## Constraint

Issues must be registered via `upsertIssue()` before `recordRun()` is meaningful. `retryAlerts.recordRun()` for an unknown key is a no-op in both the old and new design (old: count stored but never surfaced in issues; new: silently skipped by `issues.recordRun()`). This is acceptable — callers are expected to upsert before running.

## Alternatives Considered

| Option | Verdict |
|--------|---------|
| Keep `retryAlerts.js` as source of truth, have `issues.js` delegate to it | Rejected — inverts dependency; issues store becomes aware of alerting logic |
| Merge both modules | Rejected — loses separation of concerns (issue CRUD vs. alerting) |
| Document the split as intentional with explicit sync | Rejected — sync step is an error-prone footgun; simpler to eliminate the split |

## Implementation Notes

- Tracked in SO-19 (this ADR)
- Implementation is a follow-up task; this ADR documents the decision and unblocks that work
- The `retryAlerts.reset()` function should also call `issues.reset()` — or be scoped to not reset the issues store (TBD by implementer)
