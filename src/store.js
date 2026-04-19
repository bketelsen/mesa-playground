// In-memory user store
let nextId = 1;
const users = new Map();

function createUser(data) {
  const id = String(nextId++);
  const user = { id, name: data.name, email: data.email };
  users.set(id, user);
  return user;
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
  nextId = 1;
}

export { createUser, getUser, listUsers, updateUser, deleteUser, reset };
