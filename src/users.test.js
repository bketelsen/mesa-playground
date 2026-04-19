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

function post(path, data) {
  return req(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

function put(path, data) {
  return req(path, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

describe('GET /api/users', () => {
  it('returns empty list initially', async () => {
    const { status, body } = await req('');
    assert.equal(status, 200);
    assert.deepEqual(body, []);
  });

  it('returns list with created users', async () => {
    await post('', { name: 'Alice', email: 'alice@example.com' });
    await post('', { name: 'Bob', email: 'bob@example.com' });
    const { status, body } = await req('');
    assert.equal(status, 200);
    assert.equal(body.length, 2);
  });
});

describe('POST /api/users', () => {
  it('creates a user and returns 201', async () => {
    const { status, body } = await post('', { name: 'Alice', email: 'alice@example.com' });
    assert.equal(status, 201);
    assert.ok(body.id);
    assert.equal(body.name, 'Alice');
    assert.equal(body.email, 'alice@example.com');
  });

  it('returns 400 when name is missing', async () => {
    const { status, body } = await post('', { email: 'alice@example.com' });
    assert.equal(status, 400);
    assert.equal(body.error.code, 400);
    assert.ok(body.error.message);
  });

  it('returns 400 when email is missing', async () => {
    const { status, body } = await post('', { name: 'Alice' });
    assert.equal(status, 400);
    assert.equal(body.error.code, 400);
  });

  it('returns 400 for invalid email format', async () => {
    const { status, body } = await post('', { name: 'Alice', email: 'not-an-email' });
    assert.equal(status, 400);
    assert.equal(body.error.code, 400);
  });

  it('returns 400 for invalid JSON body', async () => {
    const { status, body } = await req('', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{bad json',
    });
    assert.equal(status, 400);
    assert.equal(body.error.message, 'Invalid JSON');
  });

  it('returns 400 when both fields are missing', async () => {
    const { status, body } = await post('', {});
    assert.equal(status, 400);
    assert.equal(body.error.code, 400);
  });
});

describe('GET /api/users/:id', () => {
  it('returns user by id', async () => {
    const { body: created } = await post('', { name: 'Bob', email: 'bob@example.com' });
    const { status, body } = await req(`/${created.id}`);
    assert.equal(status, 200);
    assert.equal(body.id, created.id);
    assert.equal(body.name, 'Bob');
    assert.equal(body.email, 'bob@example.com');
  });

  it('returns 404 for unknown id', async () => {
    const { status, body } = await req('/9999');
    assert.equal(status, 404);
    assert.equal(body.error.code, 404);
    assert.equal(body.error.message, 'User not found');
  });
});

describe('PUT /api/users/:id', () => {
  it('updates user fields', async () => {
    const { body: created } = await post('', { name: 'Carol', email: 'carol@example.com' });
    const { status, body } = await put(`/${created.id}`, {
      name: 'Caroline',
      email: 'carol@example.com',
    });
    assert.equal(status, 200);
    assert.equal(body.name, 'Caroline');
    assert.equal(body.email, 'carol@example.com');
  });

  it('updates user email', async () => {
    const { body: created } = await post('', { name: 'Dave', email: 'dave@example.com' });
    const { status, body } = await put(`/${created.id}`, {
      name: 'Dave',
      email: 'dave2@example.com',
    });
    assert.equal(status, 200);
    assert.equal(body.email, 'dave2@example.com');
  });

  it('returns 404 for unknown id', async () => {
    const { status, body } = await put('/9999', {
      name: 'X',
      email: 'x@example.com',
    });
    assert.equal(status, 404);
    assert.equal(body.error.code, 404);
    assert.equal(body.error.message, 'User not found');
  });

  it('returns 400 for invalid JSON body', async () => {
    const { body: created } = await post('', { name: 'Eve', email: 'eve@example.com' });
    const { status, body } = await req(`/${created.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: '{bad json',
    });
    assert.equal(status, 400);
    assert.equal(body.error.message, 'Invalid JSON');
  });

  it('returns 400 for invalid email on update', async () => {
    const { body: created } = await post('', { name: 'Eve', email: 'eve@example.com' });
    const { status, body } = await put(`/${created.id}`, {
      name: 'Eve',
      email: 'not-valid',
    });
    assert.equal(status, 400);
    assert.equal(body.error.code, 400);
  });
});

describe('DELETE /api/users/:id', () => {
  it('deletes a user and returns deleted: true', async () => {
    const { body: created } = await post('', { name: 'Frank', email: 'frank@example.com' });
    const { status, body } = await req(`/${created.id}`, { method: 'DELETE' });
    assert.equal(status, 200);
    assert.deepEqual(body, { deleted: true });
  });

  it('returns 404 for unknown id', async () => {
    const { status, body } = await req('/9999', { method: 'DELETE' });
    assert.equal(status, 404);
    assert.equal(body.error.code, 404);
    assert.equal(body.error.message, 'User not found');
  });

  it('user is inaccessible after deletion', async () => {
    const { body: created } = await post('', { name: 'Grace', email: 'grace@example.com' });
    await req(`/${created.id}`, { method: 'DELETE' });
    const { status } = await req(`/${created.id}`);
    assert.equal(status, 404);
  });

  it('deleted user is removed from list', async () => {
    const { body: created } = await post('', { name: 'Hank', email: 'hank@example.com' });
    await req(`/${created.id}`, { method: 'DELETE' });
    const { body: list } = await req('');
    assert.equal(list.length, 0);
  });
});

describe('404 fallback', () => {
  it('returns 404 for unsupported method on collection route', async () => {
    const { status, body } = await req('', { method: 'PATCH' });
    assert.equal(status, 404);
    assert.equal(body.error.code, 404);
  });
});
