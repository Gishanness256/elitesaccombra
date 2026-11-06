'use strict';

const authService = require('../services/auth.service');

function httpError(status, code, message) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function publicUser(user) {
  if (!user) return null;

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    initials: user.initials || user.ini || undefined
  };
}

function bearerToken(req) {
  const authorization = req.get('authorization') || '';
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : undefined;
}

async function login(req, res) {
  const body = req.body || {};
  const identifier = String(
    body.identifier || body.email || body.phone || body.id || ''
  ).trim();
  const password = body.password;

  if (!identifier || typeof password !== 'string' || !password) {
    throw httpError(400, 'VALIDATION_ERROR', 'Login identifier and password are required.');
  }

  const result = await authService.login({ identifier, password });

  if (!result || !result.user) {
    throw httpError(401, 'INVALID_CREDENTIALS', 'Invalid login credentials.');
  }

  const response = {
    data: {
      user: publicUser(result.user)
    }
  };

  // Include a token only when the service provides one. Never log or expose
  // password or password-hash fields.
  if (result.accessToken) {
    response.data.accessToken = result.accessToken;
  }

  res.status(200).json(response);
}

async function logout(req, res) {
  await authService.logout({
    userId: req.user && req.user.id,
    token: bearerToken(req),
    sessionId: req.sessionID
  });

  res.status(200).json({
    data: { loggedOut: true }
  });
}

async function getCurrentUser(req, res) {
  const user = typeof authService.getCurrentUser === 'function'
    ? await authService.getCurrentUser(req.user && req.user.id)
    : req.user;

  if (!user) {
    throw httpError(401, 'UNAUTHENTICATED', 'Authentication is required.');
  }

  res.status(200).json({
    data: { user: publicUser(user) }
  });
}

module.exports = {
  login,
  logout,
  getCurrentUser
};
