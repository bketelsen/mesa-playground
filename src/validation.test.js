import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validateUser } from './validation.js';

describe('validateUser — valid inputs', () => {
  it('accepts valid name and email', () => {
    const result = validateUser({ name: 'Alice', email: 'alice@example.com' });
    assert.ok(result.valid);
    assert.equal(result.errors, undefined);
  });

  it('accepts email with subdomain', () => {
    const result = validateUser({ name: 'Bob', email: 'bob@mail.example.com' });
    assert.ok(result.valid);
  });

  it('accepts name of exactly 1 character', () => {
    const result = validateUser({ name: 'A', email: 'a@example.com' });
    assert.ok(result.valid);
  });

  it('accepts name at maximum length of 100', () => {
    const result = validateUser({ name: 'a'.repeat(100), email: 'test@example.com' });
    assert.ok(result.valid);
  });
});

describe('validateUser — name validation', () => {
  it('rejects missing name', () => {
    const result = validateUser({ email: 'alice@example.com' });
    assert.ok(!result.valid);
    assert.ok(result.errors.some(e => e.includes('name')));
  });

  it('rejects null name', () => {
    const result = validateUser({ name: null, email: 'alice@example.com' });
    assert.ok(!result.valid);
    assert.ok(result.errors.some(e => e.includes('name')));
  });

  it('rejects empty string name', () => {
    const result = validateUser({ name: '', email: 'alice@example.com' });
    assert.ok(!result.valid);
    assert.ok(result.errors.some(e => e.includes('name')));
  });

  it('rejects non-string name (number)', () => {
    const result = validateUser({ name: 42, email: 'alice@example.com' });
    assert.ok(!result.valid);
    assert.ok(result.errors.some(e => e.includes('string')));
  });

  it('rejects non-string name (object)', () => {
    const result = validateUser({ name: {}, email: 'alice@example.com' });
    assert.ok(!result.valid);
    assert.ok(result.errors.some(e => e.includes('string')));
  });

  it('rejects name exceeding 100 characters', () => {
    const result = validateUser({ name: 'a'.repeat(101), email: 'alice@example.com' });
    assert.ok(!result.valid);
    assert.ok(result.errors.some(e => e.includes('name')));
  });
});

describe('validateUser — email validation', () => {
  it('rejects missing email', () => {
    const result = validateUser({ name: 'Alice' });
    assert.ok(!result.valid);
    assert.ok(result.errors.some(e => e.includes('email')));
  });

  it('rejects null email', () => {
    const result = validateUser({ name: 'Alice', email: null });
    assert.ok(!result.valid);
    assert.ok(result.errors.some(e => e.includes('email')));
  });

  it('rejects empty string email', () => {
    const result = validateUser({ name: 'Alice', email: '' });
    assert.ok(!result.valid);
    assert.ok(result.errors.some(e => e.includes('email')));
  });

  it('rejects non-string email (number)', () => {
    const result = validateUser({ name: 'Alice', email: 123 });
    assert.ok(!result.valid);
    assert.ok(result.errors.some(e => e.includes('string')));
  });

  it('rejects email without @', () => {
    const result = validateUser({ name: 'Alice', email: 'notanemail' });
    assert.ok(!result.valid);
    assert.ok(result.errors.some(e => e.includes('email')));
  });

  it('rejects email without domain after @', () => {
    const result = validateUser({ name: 'Alice', email: 'alice@' });
    assert.ok(!result.valid);
  });

  it('rejects email without TLD', () => {
    const result = validateUser({ name: 'Alice', email: 'alice@example' });
    assert.ok(!result.valid);
  });

  it('rejects email with spaces', () => {
    const result = validateUser({ name: 'Alice', email: 'alice @example.com' });
    assert.ok(!result.valid);
  });
});

describe('validateUser — multiple errors', () => {
  it('reports errors for both fields when both are missing', () => {
    const result = validateUser({});
    assert.ok(!result.valid);
    assert.equal(result.errors.length, 2);
  });

  it('reports errors for both fields when both are invalid', () => {
    const result = validateUser({ name: '', email: 'bad' });
    assert.ok(!result.valid);
    assert.equal(result.errors.length, 2);
  });
});
