'use strict';

const permissionsService = require('../services/permissions.service');

const knownPermissions = new Set(
  Object.values(permissionsService.PERMISSIONS)
);

function httpError(status, code, message) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

/**
 * Usage:
 *   requirePermission(PERMISSIONS.APPROVE_LOANS)
 *   requirePermission([PERMISSIONS.WEEKLY_REPORTS, PERMISSIONS.MONTHLY_REPORTS], { mode: 'any' })
 *
 * The default mode is "all" when multiple permissions are supplied.
 */
function requirePermission(permissionOrPermissions, { mode = 'all' } = {}) {
  const permissions = Array.isArray(permissionOrPermissions)
    ? permissionOrPermissions
    : [permissionOrPermissions];

  if (
    permissions.length === 0 ||
    permissions.some((permission) => !knownPermissions.has(permission))
  ) {
    throw new TypeError('requirePermission received an unknown or empty permission list.');
  }

  if (!['all', 'any'].includes(mode)) {
    throw new TypeError('Permission mode must be "all" or "any".');
  }

  return function permissionMiddleware(req, res, next) {
    if (!req.user) {
      return next(httpError(401, 'UNAUTHENTICATED', 'Authentication is required.'));
    }

    try {
      const allowed = mode === 'any'
        ? permissionsService.hasAnyPermission(req.user, permissions)
        : permissionsService.hasAllPermissions(req.user, permissions);

      if (!allowed) {
        return next(httpError(403, 'FORBIDDEN', 'You do not have permission to perform this action.'));
      }

      return next();
    } catch (error) {
      return next(error);
    }
  };
}

module.exports = requirePermission;