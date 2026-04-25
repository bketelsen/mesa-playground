# SO-14: Archetype Patch Audit Trail API

## Overview

Append-only audit trail for archetype patch state transitions. Every status change is recorded in an immutable history log on the patch record.

## Data Model

```
Patch {
  id               string    — 16-char hex, randomly generated
  archetype_id     string    — identifies the target archetype (e.g. "backend")
  archetype_version string?  — snapshot of archetype version at proposal time
  description      string    — human-readable summary of the change
  patch_data       any?      — machine-readable diff/config payload
  reason           string?   — business justification

  status           enum      — current status (see lifecycle below)

  proposed_at      ISO8601
  proposed_by      string

  approved_at      ISO8601?
  approved_by      string?

  rejected_at      ISO8601?
  rejected_by      string?
  rejection_reason string?

  deployed_at      ISO8601?
  reverted_at      ISO8601?

  history          StateSnapshot[]  — append-only log of prior states
}

StateSnapshot {
  status   string
  actor    string
  at       ISO8601
}
```

## Lifecycle / Allowed Transitions

```
proposed → approved | rejected
approved → deployed | rejected
deployed → reverted
rejected → (terminal)
reverted → (terminal)
```

## API Endpoints

All routes are under `/api/v1/archetypes`.

### List all patches
```
GET /api/v1/archetypes/patches
```
Query params:
- `status` — comma-separated list (e.g. `?status=proposed,approved`)
- `archetype_id` — filter to a specific archetype

### Propose a patch
```
POST /api/v1/archetypes/patches
Body: { archetype_id*, proposed_by*, description*, archetype_version?, patch_data?, reason? }
→ 201 Patch
```

### Get a single patch
```
GET /api/v1/archetypes/patches/:patchId
→ 200 Patch | 404
```

### Generic status transition
```
POST /api/v1/archetypes/patches/:patchId/transition
Body: { status*, actor*, reason? }
→ 200 Patch | 400 invalid_status | 422 invalid_transition | 404
```

### Approve (and auto-deploy)
```
POST /api/v1/archetypes/patches/:patchId/approve
Body: { actor* }
→ 200 Patch (status=deployed) | 404 | 409 not in proposable state
```

### Reject
```
POST /api/v1/archetypes/patches/:patchId/reject
Body: { actor*, reason? }
→ 200 Patch | 404 | 409
```

### Active patches for an archetype
```
GET /api/v1/archetypes/:archetypeId/active-patches
→ 200 Patch[]  (status=deployed only)
```

## Immutability Guarantee

Patches are never deleted. Each `transitionPatch` call:
1. Snapshots the current `{ status, actor, at }` into `patch.history` before mutating
2. Updates the top-level status and relevant timestamp fields

The `history` array grows monotonically and is never modified in-place.

## Implementation Files

- `src/archetypePatches.js` — in-memory store + business logic
- `src/archetypePatchesRouter.js` — HTTP route handlers
- `src/archetypePatches.test.js` — unit tests (14 cases)
- `src/index.js` — wired at `/api/v1/archetypes`
