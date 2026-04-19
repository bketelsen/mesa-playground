# mesa-playground

A lightweight Node.js REST API for user management with Bearer token authentication and per-IP rate limiting.

## How to Run

**Requirements:** Node.js 18+

```bash
# Install dependencies (none — stdlib only)
npm install

# Start the server (default port 3000)
npm start

# Run the test suite
npm test

# Run quality gates
bash artifact-docs/gates.sh
```

Set `PORT` to override the default:

```bash
PORT=8080 npm start
```

---

## Authentication

Token-based authentication uses **Bearer tokens**. Tokens are issued at user creation and cannot be refreshed or rotated.

### Acquiring a token

Create a user — the response includes a `token` field:

```http
POST /api/users
Content-Type: application/json

{"name": "Alice", "email": "alice@example.com"}
```

```json
{
  "id": "1",
  "name": "Alice",
  "email": "alice@example.com",
  "token": "a3f8c2..."
}
```

### Using the token

Pass the token as a Bearer header on any protected request:

```
Authorization: Bearer a3f8c2...
```

Tokens are scoped to the owning user — a token for user `1` cannot modify user `2`.

---

## Endpoints

### `GET /health`

Returns server status and runtime metrics. No authentication required.

**Response `200`**

```json
{
  "status": "ok",
  "timestamp": "2026-04-19T12:00:00.000Z",
  "uptime": 42.3,
  "requestCount": 17,
  "activeConnections": 2
}
```

---

### `GET /api/users`

Returns all users. No authentication required.

**Response `200`**

```json
[
  {"id": "1", "name": "Alice", "email": "alice@example.com", "token": "a3f8c2..."},
  {"id": "2", "name": "Bob",   "email": "bob@example.com",   "token": "d9e1f4..."}
]
```

---

### `POST /api/users`

Creates a new user. No authentication required (this is the registration endpoint).

**Request body**

| Field   | Type   | Required | Constraints                       |
|---------|--------|----------|-----------------------------------|
| `name`  | string | yes      | 1–100 characters                  |
| `email` | string | yes      | valid email format                |

**Example request**

```http
POST /api/users
Content-Type: application/json

{"name": "Alice", "email": "alice@example.com"}
```

**Response `201`**

```json
{
  "id": "1",
  "name": "Alice",
  "email": "alice@example.com",
  "token": "a3f8c2..."
}
```

**Response `400`** — validation failure

```json
{"error": "name is required, email must be a valid email address"}
```

---

### `GET /api/users/:id`

Returns a single user by ID. No authentication required.

**Response `200`**

```json
{"id": "1", "name": "Alice", "email": "alice@example.com", "token": "a3f8c2..."}
```

**Response `404`**

```json
{"error": "User not found"}
```

---

### `PUT /api/users/:id`

Updates a user's `name` and/or `email`. **Requires authentication** — the token must belong to the user being updated.

**Headers**

```
Authorization: Bearer <token>
Content-Type: application/json
```

**Request body** (all fields optional, but at least one must be present)

| Field   | Type   | Constraints                        |
|---------|--------|------------------------------------|
| `name`  | string | 1–100 characters                   |
| `email` | string | valid email format                 |

**Example request**

```http
PUT /api/users/1
Authorization: Bearer a3f8c2...
Content-Type: application/json

{"name": "Alicia"}
```

**Response `200`**

```json
{"id": "1", "name": "Alicia", "email": "alice@example.com", "token": "a3f8c2..."}
```

**Response `401`** — missing or invalid token

```json
{"error": "Missing or invalid Authorization header"}
```

**Response `403`** — token belongs to a different user

```json
{"error": "Forbidden"}
```

**Response `404`**

```json
{"error": "User not found"}
```

---

### `DELETE /api/users/:id`

Deletes a user. **Requires authentication** — the token must belong to the user being deleted.

**Headers**

```
Authorization: Bearer <token>
```

**Example request**

```http
DELETE /api/users/1
Authorization: Bearer a3f8c2...
```

**Response `200`**

```json
{"deleted": true}
```

**Response `401`** — missing or invalid token

```json
{"error": "Missing or invalid Authorization header"}
```

**Response `403`** — token belongs to a different user

```json
{"error": "Forbidden"}
```

**Response `404`**

```json
{"error": "User not found"}
```

---

## Rate Limiting

All endpoints share a per-IP rate limit.

| Setting       | Value              |
|---------------|--------------------|
| Limit         | 100 requests       |
| Window        | 15 minutes         |
| Scope         | Per IP address     |
| Store         | In-memory (resets on server restart) |

When the limit is exceeded the server responds with `429 Too Many Requests`:

```
HTTP/1.1 429 Too Many Requests
Content-Type: application/json
Retry-After: 843
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1745067600
```

```json
{"error": "Too Many Requests"}
```

- **`Retry-After`** — seconds until the current window expires
- **`X-RateLimit-Reset`** — Unix timestamp when the window resets
- The IP is read from `X-Forwarded-For` (first value) if present, otherwise from the TCP socket

---

## Error Format

All error responses share a consistent shape:

```json
{"error": "<message>"}
```

| HTTP Status | Meaning                              |
|-------------|--------------------------------------|
| 400         | Bad request / validation failure     |
| 401         | Missing or invalid Bearer token      |
| 403         | Token valid but not authorized       |
| 404         | Resource not found                   |
| 429         | Rate limit exceeded                  |
| 500         | Internal server error                |
