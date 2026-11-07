'use strict';

const crypto = require('node:crypto');
const database = require('../config/database');

const SESSION_TTL_HOURS = readSessionTtl();
const DUMMY_HASH = crypto.createHash('sha256').update('invalid-password').digest();

function readSessionTtl() {
  const raw = process.env.AUTH_SESSION_TTL_HOURS || '12';
  const value = Number(raw);

  if (!Number.isInteger(value) || value < 1 || value > 720) {
    throw new Error('AUTH_SESSION_TTL_HOURS must be an integer from 1 to 720.');
  }

  return value;
}

function safeUser(row) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    initials: row.initials || null
  };
}

function tokenDigest(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

async function verifyPassword(password, passwordHash) {
  if (typeof passwordHash !== 'string' || !passwordHash) return false;

  if (passwordHash.startsWith('$argon2')) {
    let argon2;
    try {
      argon2 = require('argon2');
    } catch {
      throw new Error('Install the argon2 package to verify this user’s password hash.');
    }

    return argon2.verify(passwordHash, password);
  }

  if (/^\$2[aby]\$/.test(passwordHash)) {
    let bcrypt;
    try {
      bcrypt = require('bcrypt');
    } catch {
      try {
        bcrypt = require('bcryptjs');
      } catch {
        throw new Error('Install bcrypt or bcryptjs to verify this user’s password hash.');
      }
    }

    return bcrypt.compare(password, passwordHash);
  }

  // Still perform a constant-time comparison for missing or unsupported hashes.
  crypto.timingSafeEqual(DUMMY_HASH, DUMMY_HASH);
  return false;
}

async function login({ identifier, password }) {
  if (
    typeof identifier !== 'string' ||
    !identifier.trim() ||
    typeof password !== 'string' ||
    !password
  ) {
    return null;
  }

  const result = await database.query(
    `SELECT id, name, email, role, initials, password_hash, is_active
       FROM users
      WHERE lower(email) = lower($1)
      LIMIT 1`,
    [identifier.trim()]
  );

  const row = result.rows[0];

  // Run a dummy comparison for unknown accounts to reduce timing differences.
  if (!row) {
    await verifyPassword(password, '');
    return null;
  }

  const passwordMatches = await verifyPassword(password, row.password_hash);
  if (!passwordMatches || row.is_active !== true) return null;

  const accessToken = crypto.randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + SESSION_TTL_HOURS * 60 * 60 * 1000);

  await database.transaction(async (client) => {
    await client.query(
      `INSERT INTO auth_sessions (user_id, token_hash, expires_at, created_at)
       VALUES ($1, $2, $3, NOW())`,
      [row.id, tokenDigest(accessToken), expiresAt]
    );
  });

  return {
    user: safeUser(row),
    accessToken,
    expiresAt: expiresAt.toISOString()
  };
}

async function logout({ userId, token, sessionId } = {}) {
  if (token) {
    await database.query(
      `UPDATE auth_sessions
          SET revoked_at = NOW()
        WHERE token_hash = $1
          AND revoked_at IS NULL
          AND ($2::text IS NULL OR user_id::text = $2)`,
      [tokenDigest(token), userId == null ? null : String(userId)]
    );
    return;
  }

  // Optional fallback for applications whose auth middleware provides a
  // database session ID instead of a bearer token.
  if (sessionId) {
    await database.query(
      `UPDATE auth_sessions
          SET revoked_at = NOW()
        WHERE id::text = $1
          AND revoked_at IS NULL
          AND ($2::text IS NULL OR user_id::text = $2)`,
      [String(sessionId), userId == null ? null : String(userId)]
    );
  }
}

async function getCurrentUser(userId) {
  if (userId == null || String(userId).trim() === '') return null;

  const result = await database.query(
    `SELECT id, name, email, role, initials
       FROM users
      WHERE id::text = $1
        AND is_active = TRUE
      LIMIT 1`,
    [String(userId)]
  );

  return result.rows[0] ? safeUser(result.rows[0]) : null;
}

module.exports = {
  login,
  logout,
  getCurrentUser
};