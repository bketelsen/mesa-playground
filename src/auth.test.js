import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { usersRouter } from './users.js';
import { reset } from './store.js';

let server;
let baseUrl;

before(async () => {
  server = createServer(usersRouter);
  await new Promise(resolve => server.listen(0, resolve));
  const { port } = server.address();
  baseUrl = `http://localhost:${port}/api/users`;
});

after(async () => {
  await new Promise(resolve => server.close(resolve));
});

beforeEach(() => {
  reset();
});

async function req(path, opts = {}) {
  const res = await fetch(`${baseUrl}${path}`, opts);
  const body = await res.json();
  return { status: res.status, body };
}

async function createUser(name, email) {
  const res = await fetch(baseUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, email }),
  });
  return res.json();
}

describe('POST /api/users - token generation', () => {
  it('returns a token on user creation', async () => {
    const user = await createUser('Alice', 'alice@example.com');
    assert.ok(user.token, 'token should be present');
    assert.equal(typeof user.token, 'string');
    assert.ok(user.token.length > 0);
  });

  it('generates unique tokens for each user', async () => {
    const user1 = await createUser('Alice', 'alice@example.com');
    const user2 = await createUser('Bob', 'bob@example.com');
    assert.notEqual(user1.token, user2.token);
  });
});

describe('PUT /api/users/:id - authentication', () => {
  it('returns 401 when Authorization header is missing', async () => {
    const user = await createUser('Alice', 'alice@example.com');
    const { status, body } = await req(`/${user.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Alice2', email: 'alice2@example.com' }),
    });
    assert.equal(status, 401);
    assert.equal(body.error.code, 401);
  });

  it('returns 401 for malformed Authorization header', async () => {
    const user = await createUser('Alice', 'alice@example.com');
    const { status, body } = await req(`/${user.id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Token badformat',
      },
      body: JSON.stringify({ name: 'Alice2', email: 'alice2@example.com' }),
    });
    assert.equal(status, 401);
    assert.equal(body.error.code, 401);
  });

  it('returns 401 for invalid (unknown) token', async () => {
    const user = await createUser('Alice', 'alice@example.com');
    const { status, body } = await req(`/${user.id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer invalidtoken',
      },
      body: JSON.stringify({ name: 'Alice2', email: 'alice2@example.com' }),
    });
    assert.equal(status, 401);
    assert.equal(body.error.code, 401);
  });

  it('returns 403 when token belongs to a different user', async () => {
    const alice = await createUser('Alice', 'alice@example.com');
    const bob = await createUser('Bob', 'bob@example.com');
    const { status, body } = await req(`/${alice.id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${bob.token}`,
      },
      body: JSON.stringify({ name: 'Alice2', email: 'alice2@example.com' }),
    });
    assert.equal(status, 403);
    assert.equal(body.error.code, 403);
  });

  it('succeeds with the correct user token', async () => {
    const user = await createUser('Alice', 'alice@example.com');
    const { status, body } = await req(`/${user.id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${user.token}`,
      },
      body: JSON.stringify({ name: 'Alice Updated', email: 'alice@example.com' }),
    });
    assert.equal(status, 200);
    assert.equal(body.name, 'Alice Updated');
  });
});

describe('DELETE /api/users/:id - authentication', () => {
  it('returns 401 when Authorization header is missing', async () => {
    const user = await createUser('Alice', 'alice@example.com');
    const { status, body } = await req(`/${user.id}`, { method: 'DELETE' });
    assert.equal(status, 401);
    assert.equal(body.error.code, 401);
  });

  it('returns 401 for invalid token', async () => {
    const user = await createUser('Alice', 'alice@example.com');
    const { status, body } = await req(`/${user.id}`, {
      method: 'DELETE',
      headers: { 'Authorization': 'Bearer badtoken' },
    });
    assert.equal(status, 401);
    assert.equal(body.error.code, 401);
  });

  it('returns 403 when token belongs to a different user', async () => {
    const alice = await createUser('Alice', 'alice@example.com');
    const bob = await createUser('Bob', 'bob@example.com');
    const { status, body } = await req(`/${alice.id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${bob.token}` },
    });
    assert.equal(status, 403);
    assert.equal(body.error.code, 403);
  });

  it('succeeds with the correct user token', async () => {
    const user = await createUser('Alice', 'alice@example.com');
    const { status, body } = await req(`/${user.id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${user.token}` },
    });
    assert.equal(status, 200);
    assert.deepEqual(body, { deleted: true });
  });
});

describe('GET endpoints remain public', () => {
  it('GET /api/users does not require auth', async () => {
    const { status } = await req('');
    assert.equal(status, 200);
  });

  it('GET /api/users/:id does not require auth', async () => {
    const user = await createUser('Alice', 'alice@example.com');
    const { status } = await req(`/${user.id}`);
    assert.equal(status, 200);
  });
});
