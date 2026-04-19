const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateUser(body) {
  const errors = [];

  if (body.name === undefined || body.name === null || body.name === '') {
    errors.push('name is required');
  } else if (typeof body.name !== 'string') {
    errors.push('name must be a string');
  } else if (body.name.length < 1 || body.name.length > 100) {
    errors.push('name must be between 1 and 100 characters');
  }

  if (body.email === undefined || body.email === null || body.email === '') {
    errors.push('email is required');
  } else if (typeof body.email !== 'string') {
    errors.push('email must be a string');
  } else if (!EMAIL_RE.test(body.email)) {
    errors.push('email must be a valid email address');
  }

  return errors.length === 0
    ? { valid: true }
    : { valid: false, errors };
}

export function validatePartialUser(body) {
  const errors = [];

  if (body.name !== undefined) {
    if (body.name === null || body.name === '') {
      errors.push('name must not be empty');
    } else if (typeof body.name !== 'string') {
      errors.push('name must be a string');
    } else if (body.name.length > 100) {
      errors.push('name must be between 1 and 100 characters');
    }
  }

  if (body.email !== undefined) {
    if (body.email === null || body.email === '') {
      errors.push('email must not be empty');
    } else if (typeof body.email !== 'string') {
      errors.push('email must be a string');
    } else if (!EMAIL_RE.test(body.email)) {
      errors.push('email must be a valid email address');
    }
  }

  return errors.length === 0
    ? { valid: true }
    : { valid: false, errors };
}
