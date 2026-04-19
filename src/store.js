import { randomBytes } from 'node:crypto';

// In-memory user store
let nextId = 1;
const users = new Map();
const tokenIndex = new Map();

function createUser(data) {
  const id = String(nextId++);
  const token = randomBytes(32).toString('hex');
  const user = { id, name: data.name, email: data.email, token };
  users.set(id, user);
  tokenIndex.set(token, id);
  return user;
}

function getUserByToken(token) {
  const id = tokenIndex.get(token);
  return id ? (users.get(id) ?? null) : null;
}

function getUser(id) {
  return users.get(id) ?? null;
}

function listUsers() {
  return Array.from(users.values());
}

function updateUser(id, data) {
  const user = users.get(id);
  if (!user) return null;
  if (data.name !== undefined) user.name = data.name;
  if (data.email !== undefined) user.email = data.email;
  return user;
}

function deleteUser(id) {
  return users.delete(id);
}

function reset() {
  users.clear();
  tokenIndex.clear();
  nextId = 1;
}

export { createUser, getUserByToken, getUser, listUsers, updateUser, deleteUser, reset };
