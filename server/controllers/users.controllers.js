'use strict';

const usersRepository = require('../repositories/users.repository');

const ROLES = new Set([
  'Admin',
  'Treasurer',
  'Credit Supervisor',
  'Credit Officer'
]);

function httpError(status, code, message) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function publicUser(user) {
  if (!user) return null;

  // Explicit allowlist prevents password hashes and other internal fields
  // from appearing in API responses.
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    initials: user.initials || user.ini || null,
    createdAt: user.createdAt || user.created_at || null,
    updatedAt: user.updatedAt || user.updated_at || null
  };
}

function requireId(value) {
  const id = String(value || '').trim();
  if (!id || id.length > 128) {
    throw httpError(400, 'VALIDATION_ERROR', 'A valid user ID is required.');
  }
  return id;
}

function parsePagination(query) {
  const limit = query.limit == null ? 50 : Number(query.limit);
  const offset = query.offset == null ? 0 : Number(query.offset);

  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw httpError(400, 'VALIDATION_ERROR', 'limit must be an integer from 1 to 100.');
  }
  if (!Number.isInteger(offset) || offset < 0) {
    throw httpError(400, 'VALIDATION_ERROR', 'offset must be a non-negative integer.');
  }

  return { limit, offset };
}

function validateName(value) {
  const name = typeof value === 'string' ? value.trim() : '';
  if (!name || name.length > 160) {
    throw httpError(400, 'VALIDATION_ERROR', 'Name is required and must be at most 160 characters.');
  }
  return name;
}

function validateEmail(value) {
  const email = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (
    email.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  ) {
    throw httpError(400, 'VALIDATION_ERROR', 'A valid email address is required.');
  }
  return email;
}

function validateRole(value) {
  if (!ROLES.has(value)) {
    throw httpError(400, 'VALIDATION_ERROR', 'A valid system role is required.');
  }
  return value;
}

function validateInitials(value) {
  if (value == null || value === '') return null;

  const initials = String(value).trim().toUpperCase();
  if (!/^[A-Z]{1,3}$/.test(initials)) {
    throw httpError(400, 'VALIDATION_ERROR', 'Initials must be one to three letters.');
  }
  return initials;
}

function ensureRepositoryMethod(methodName) {
  if (typeof usersRepository[methodName] !== 'function') {
    throw new Error(`users.repository.js must implement ${methodName}().`);
  }
}

async function listUsers(req, res) {
  ensureRepositoryMethod('list');

  const pagination = parsePagination(req.query);
  const result = await usersRepository.list(pagination);

  const users = Array.isArray(result) ? result : result && result.users;
  if (!Array.isArray(users)) {
    throw new Error('users.repository.list() must return an array or { users, total }.');
  }

  res.status(200).json({
    data: {
      users: users.map(publicUser),
      pagination: {
        limit: pagination.limit,
        offset: pagination.offset,
        total: Array.isArray(result) ? users.length : Number(result.total) || 0
      }
    }
  });
}

async function getUserById(req, res) {
  ensureRepositoryMethod('findById');

  const user = await usersRepository.findById(requireId(req.params.id));
  if (!user) throw httpError(404, 'NOT_FOUND', 'User not found.');

  res.status(200).json({ data: { user: publicUser(user) } });
}

async function createUser(req, res) {
  ensureRepositoryMethod('create');

  const body = req.body || {};
  const name = validateName(body.name);
  const email = validateEmail(body.email);
  const role = validateRole(body.role);
  const initials = validateInitials(body.initials);

  // The repository must hash this password using a password-hashing
  // algorithm (for example, Argon2id or bcrypt) before persisting it.
  const password = body.password;
  if (typeof password !== 'string' || password.length < 12 || password.length > 1024) {
    throw httpError(400, 'VALIDATION_ERROR', 'Password must be between 12 and 1024 characters.');
  }

  const user = await usersRepository.create({
    name,
    email,
    role,
    initials,
    password
  });

  if (!user) throw new Error('users.repository.create() did not return the created user.');

  res.status(201).json({ data: { user: publicUser(user) } });
}

async function updateUser(req, res) {
  ensureRepositoryMethod('update');

  const id = requireId(req.params.id);
  const body = req.body || {};
  const changes = {};

  if (Object.hasOwn(body, 'name')) changes.name = validateName(body.name);
  if (Object.hasOwn(body, 'email')) changes.email = validateEmail(body.email);
  if (Object.hasOwn(body, 'role')) changes.role = validateRole(body.role);
  if (Object.hasOwn(body, 'initials')) changes.initials = validateInitials(body.initials);

  if (!Object.keys(changes).length) {
    throw httpError(400, 'VALIDATION_ERROR', 'Provide at least one supported field to update.');
  }

  const user = await usersRepository.update(id, changes);
  if (!user) throw httpError(404, 'NOT_FOUND', 'User not found.');

  res.status(200).json({ data: { user: publicUser(user) } });
}

async function deleteUser(req, res) {
  ensureRepositoryMethod('delete');

  const id = requireId(req.params.id);
  const currentUserId = req.user && String(req.user.id);

  if (currentUserId && currentUserId === id) {
    throw httpError(400, 'INVALID_OPERATION', 'You cannot remove your own account.');
  }

  const deleted = await usersRepository.delete(id);
  if (!deleted) throw httpError(404, 'NOT_FOUND', 'User not found.');

  res.status(204).end();
}

async function resetCredentials(req, res) {
  ensureRepositoryMethod('updateCredentials');

  const id = requireId(req.params.id);
  const body = req.body || {};
  const changes = {};

  if (body.email !== undefined) changes.email = validateEmail(body.email);

  if (body.password !== undefined) {
    if (
      typeof body.password !== 'string' ||
      body.password.length < 12 ||
      body.password.length > 1024
    ) {
      throw httpError(400, 'VALIDATION_ERROR', 'Password must be between 12 and 1024 characters.');
    }

    // The repository must hash the password before persistence and must
    // never return it or its hash.
    changes.password = body.password;
  }

  if (!Object.keys(changes).length) {
    throw httpError(400, 'VALIDATION_ERROR', 'Provide a new email, password, or both.');
  }

  const user = await usersRepository.updateCredentials(id, changes);
  if (!user) throw httpError(404, 'NOT_FOUND', 'User not found.');

  res.status(200).json({ data: { user: publicUser(user) } });
}

module.exports = {
  listUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser,
  resetCredentials
};
