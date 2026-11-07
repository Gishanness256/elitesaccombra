'use strict';

const crypto = require('node:crypto');
const database = require('../config/database');

function httpError(status, code, message) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function readBearerToken(req) {
  const authorization = req.get('authorization') || '';
  const match = authorization.match(/^Bearer\s+([A-Za-z0-9_-]+)$/i);

  // The auth service creates 32-byte base64url tokens (43 characters).
  if (!match || match[1].length < 32 || match[1].length > 256) {
    return null;
  }

  return match[1];
}

function digestToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

async function requireAuth(req, res, next) {
  try {
    const token = readBearerToken(req);

    if (!token) {
      return next(httpError(401, 'UNAUTHENTICATED', 'A valid bearer token is required.'));
    }

    const result = await database.query(
      `SELECT
         u.id,
         u.name,
         u.email,
         u.role,
         u.initials,
         s.id AS session_id
       FROM auth_sessions AS s
       JOIN users AS u ON u.id = s.user_id
       WHERE s.token_hash = $1
         AND s.revoked_at IS NULL
         AND s.expires_at > NOW()
         AND u.is_active = TRUE
       LIMIT 1`,
      [digestToken(token)]
    );

    const row = result.rows[0];
    if (!row) {
      return next(httpError(401, 'UNAUTHENTICATED', 'The session is invalid or expired.'));
    }

    req.user = {
      id: row.id,
      name: row.name,
      email: row.email,
      role: row.role,
      initials: row.initials || null
    };
    req.authSessionId = row.session_id;

    return next();
  } catch (error) {
    return next(error);
  }
}

module.exports = requireAuth;