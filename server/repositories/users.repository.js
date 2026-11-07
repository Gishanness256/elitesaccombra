'use strict';

const argon2 = require('argon2');
const database = require('../config/database');

const USER_COLUMNS = `
  id,
  name,
  email,
  role,
  initials,
  created_at AS "createdAt",
  updated_at AS "updatedAt"
`;

const UPDATE_COLUMNS = Object.freeze({
  name: 'name',
  email: 'email',
  role: 'role',
  initials: 'initials'
});

function httpError(status, code, message) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function validateId(value) {
  const id = String(value ?? '').trim();
  if (!id || id.length > 128) {
    throw httpError(400, 'VALIDATION_ERROR', 'A valid user ID is required.');
  }
  return id;
}

function validatePagination({ limit = 50, offset = 0 } = {}) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw httpError(400, 'VALIDATION_ERROR', 'limit must be an integer from 1 to 100.');
  }
  if (!Number.isInteger(offset) || offset < 0) {
    throw httpError(400, 'VALIDATION_ERROR', 'offset must be a non-negative integer.');
  }
  return { limit, offset };
}

function normalizeEmail(value) {
  if (typeof value !== 'string') {
    throw httpError(400, 'VALIDATION_ERROR', 'A valid email address is required.');
  }

  const email = value.trim().toLowerCase();
  if (
    email.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  ) {
    throw httpError(400, 'VALIDATION_ERROR', 'A valid email address is required.');
  }

  return email;
}

function validatePassword(value) {
  if (typeof value !== 'string' || value.length < 12 || value.length > 1024) {
    throw httpError(400, 'VALIDATION_ERROR', 'Password must be between 12 and 1024 characters.');
  }
  return value;
}

function mapDatabaseError(error) {
  if (error && error.code === '23505') {
    const mapped = httpError(409, 'CONFLICT', 'A user with that email address already exists.');
    mapped.cause = error;
    return mapped;
  }

  if (error && error.code === '23503') {
    const mapped = httpError(409, 'USER_IN_USE', 'The user cannot be removed because related records exist.');
    mapped.cause = error;
    return mapped;
  }

  return error;
}

async function list({ limit = 50, offset = 0 } = {}) {
  const page = validatePagination({ limit, offset });

  const [rowsResult, countResult] = await Promise.all([
    database.query(
      `SELECT ${USER_COLUMNS}
         FROM users
        ORDER BY created_at DESC, id DESC
        LIMIT $1 OFFSET $2`,
      [page.limit, page.offset]
    ),
    database.query('SELECT COUNT(*)::int AS total FROM users')
  ]);

  return {
    users: rowsResult.rows,
    total: countResult.rows[0].total
  };
}

async function findById(id) {
  const result = await database.query(
    `SELECT ${USER_COLUMNS}
       FROM users
      WHERE id::text = $1
      LIMIT 1`,
    [validateId(id)]
  );

  return result.rows[0] || null;
}

async function create({ name, email, role, initials = null, password } = {}) {
  if (typeof name !== 'string' || !name.trim()) {
    throw httpError(400, 'VALIDATION_ERROR', 'Name is required.');
  }
  if (typeof role !== 'string' || !role.trim()) {
    throw httpError(400, 'VALIDATION_ERROR', 'Role is required.');
  }

  const normalizedEmail = normalizeEmail(email);
  const cleanPassword = validatePassword(password);
  const passwordHash = await argon2.hash(cleanPassword, {
    type: argon2.argon2id
  });

  try {
    const result = await database.query(
      `INSERT INTO users
         (name, email, role, initials, password_hash, is_active, created_at, updated_at)
       VALUES
         ($1, $2, $3, $4, $5, TRUE, NOW(), NOW())
       RETURNING ${USER_COLUMNS}`,
      [
        name.trim(),
        normalizedEmail,
        role.trim(),
        initials == null ? null : String(initials).trim() || null,
        passwordHash
      ]
    );

    return result.rows[0];
  } catch (error) {
    throw mapDatabaseError(error);
  }
}

async function update(id, changes = {}) {
  const userId = validateId(id);
  const entries = Object.entries(changes);

  if (entries.length === 0) {
    throw httpError(400, 'VALIDATION_ERROR', 'Provide at least one field to update.');
  }

  const assignments = [];
  const values = [userId];

  for (const [key, value] of entries) {
    if (!Object.hasOwn(UPDATE_COLUMNS, key)) {
      throw httpError(400, 'VALIDATION_ERROR', `Unsupported user field: ${key}.`);
    }

    let cleanValue = value;
    if (key === 'email') cleanValue = normalizeEmail(value);
    if (key === 'name' || key === 'role') {
      if (typeof value !== 'string' || !value.trim()) {
        throw httpError(400, 'VALIDATION_ERROR', `${key} is required.`);
      }
      cleanValue = value.trim();
    }
    if (key === 'initials' && value != null) {
      cleanValue = String(value).trim() || null;
    }

    values.push(cleanValue);
    assignments.push(`${UPDATE_COLUMNS[key]} = $${values.length}`);
  }

  try {
    const result = await database.query(
      `UPDATE users
          SET ${assignments.join(', ')}, updated_at = NOW()
        WHERE id::text = $1
        RETURNING ${USER_COLUMNS}`,
      values
    );

    return result.rows[0] || null;
  } catch (error) {
    throw mapDatabaseError(error);
  }
}

async function remove(id) {
  const userId = validateId(id);

  try {
    return await database.transaction(async (client) => {
      const currentResult = await client.query(
        `SELECT id, role
           FROM users
          WHERE id::text = $1
          FOR UPDATE`,
        [userId]
      );

      const current = currentResult.rows[0];
      if (!current) return false;

      // Serialize admin removals so concurrent requests cannot remove the
      // last active administrator.
      if (current.role === 'Admin') {
        const adminsResult = await client.query(
          `SELECT id
             FROM users
            WHERE role = 'Admin'
              AND is_active = TRUE
            FOR UPDATE`
        );

        if (adminsResult.rowCount <= 1) {
          throw httpError(409, 'LAST_ADMIN', 'The last active administrator cannot be removed.');
        }
      }

      const deleted = await client.query(
        'DELETE FROM users WHERE id = $1',
        [current.id]
      );

      return deleted.rowCount > 0;
    });
  } catch (error) {
    throw mapDatabaseError(error);
  }
}

async function updateCredentials(id, changes = {}) {
  const userId = validateId(id);
  const assignments = [];
  const values = [userId];

  if (Object.hasOwn(changes, 'email')) {
    values.push(normalizeEmail(changes.email));
    assignments.push(`email = $${values.length}`);
  }

  if (Object.hasOwn(changes, 'password')) {
    const passwordHash = await argon2.hash(validatePassword(changes.password), {
      type: argon2.argon2id
    });
    values.push(passwordHash);
    assignments.push(`password_hash = $${values.length}`);
  }

  if (assignments.length === 0) {
    throw httpError(400, 'VALIDATION_ERROR', 'Provide a new email, password, or both.');
  }

  try {
    return await database.transaction(async (client) => {
      const result = await client.query(
        `UPDATE users
            SET ${assignments.join(', ')}, updated_at = NOW()
          WHERE id::text = $1
          RETURNING ${USER_COLUMNS}`,
        values
      );

      if (!result.rows[0]) return null;

      // Revoke active sessions after a credential change.
      if (Object.hasOwn(changes, 'password') || Object.hasOwn(changes, 'email')) {
        await client.query(
          `UPDATE auth_sessions
              SET revoked_at = NOW()
            WHERE user_id::text = $1
              AND revoked_at IS NULL`,
          [userId]
        );
      }

      return result.rows[0];
    });
  } catch (error) {
    throw mapDatabaseError(error);
  }
}

module.exports = {
  list,
  findById,
  create,
  update,
  delete: remove,
  updateCredentials
};