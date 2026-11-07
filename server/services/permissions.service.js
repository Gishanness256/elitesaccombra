'use strict';

const PERMISSIONS = Object.freeze({
  MANAGE_SYSTEM_USERS: 'Create/remove system users',
  MANAGE_MEMBER_ACCOUNTS: 'Create/remove member accounts',
  ACKNOWLEDGE_SAVINGS: 'Acknowledge savings/deposits',
  APPROVE_LOANS: 'Approve loans',
  ACKNOWLEDGE_LOAN_REPAYMENTS: 'Acknowledge loan repayments',
  WEEKLY_REPORTS: 'Weekly reports',
  MONTHLY_REPORTS: 'Monthly reports',
  ANNUAL_REPORTS: 'Annual reports'
});

const ALL_PERMISSIONS = Object.freeze(Object.values(PERMISSIONS));

/*
 * Keep this matrix aligned with the roles and policies in your application.
 * Grant only the permissions each role needs.
 */
const ROLE_PERMISSIONS = Object.freeze({
  Admin: ALL_PERMISSIONS,

  Treasurer: Object.freeze([
    PERMISSIONS.MANAGE_SYSTEM_USERS,
    PERMISSIONS.MANAGE_MEMBER_ACCOUNTS,
    PERMISSIONS.ACKNOWLEDGE_SAVINGS,
    PERMISSIONS.ACKNOWLEDGE_LOAN_REPAYMENTS,
    PERMISSIONS.WEEKLY_REPORTS,
    PERMISSIONS.MONTHLY_REPORTS,
    PERMISSIONS.ANNUAL_REPORTS
  ]),

  'Credit Supervisor': Object.freeze([
    PERMISSIONS.APPROVE_LOANS,
    PERMISSIONS.WEEKLY_REPORTS,
    PERMISSIONS.MONTHLY_REPORTS,
    PERMISSIONS.ANNUAL_REPORTS
  ]),

  'Credit Officer': Object.freeze([
    PERMISSIONS.ACKNOWLEDGE_SAVINGS
  ])
});

const permissionSet = new Set(ALL_PERMISSIONS);

function httpError(status, code, message) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function getRole(user) {
  return user && typeof user.role === 'string'
    ? user.role.trim()
    : '';
}

function validatePermission(permission) {
  if (!permissionSet.has(permission)) {
    throw new TypeError(`Unknown permission: ${String(permission)}`);
  }
}

function hasPermission(user, permission) {
  validatePermission(permission);

  const role = getRole(user);
  const permissions = ROLE_PERMISSIONS[role];

  return Boolean(permissions && permissions.includes(permission));
}

function hasAnyPermission(user, permissions) {
  if (!Array.isArray(permissions) || permissions.length === 0) {
    throw new TypeError('permissions must be a non-empty array.');
  }

  return permissions.some((permission) => hasPermission(user, permission));
}

function hasAllPermissions(user, permissions) {
  if (!Array.isArray(permissions) || permissions.length === 0) {
    throw new TypeError('permissions must be a non-empty array.');
  }

  return permissions.every((permission) => hasPermission(user, permission));
}

function assertPermission(user, permission) {
  if (!hasPermission(user, permission)) {
    throw httpError(403, 'FORBIDDEN', 'You do not have permission to perform this action.');
  }
}

function assertAnyPermission(user, permissions) {
  if (!hasAnyPermission(user, permissions)) {
    throw httpError(403, 'FORBIDDEN', 'You do not have permission to perform this action.');
  }
}

function assertRole(user, allowedRoles) {
  if (!Array.isArray(allowedRoles) || allowedRoles.length === 0) {
    throw new TypeError('allowedRoles must be a non-empty array.');
  }

  if (!allowedRoles.includes(getRole(user))) {
    throw httpError(403, 'FORBIDDEN', 'You do not have permission to access this resource.');
  }
}

function getPermissions(user) {
  const role = getRole(user);
  return ROLE_PERMISSIONS[role] ? [...ROLE_PERMISSIONS[role]] : [];
}

module.exports = Object.freeze({
  PERMISSIONS,
  ROLE_PERMISSIONS,
  hasPermission,
  hasAnyPermission,
  hasAllPermissions,
  assertPermission,
  assertAnyPermission,
  assertRole,
  getPermissions
});