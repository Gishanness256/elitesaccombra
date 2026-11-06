'use strict';

const express = require('express');

const auditController = require('../controllers/audit.controller');
const requireAuth = require('../middleware/require-auth');
const asyncHandler = require('../utils/async-handler');

const router = express.Router();
const AUDIT_ROLES = new Set(['Admin', 'Treasurer']);

function requireAuditAccess(req, res, next) {
  const role = req.user && req.user.role;

  if (!AUDIT_ROLES.has(role)) {
    return res.status(403).json({
      error: {
        code: 'FORBIDDEN',
        message: 'You do not have permission to view the audit log.'
      }
    });
  }

  return next();
}

router.use(requireAuth, requireAuditAccess);

// Supports optional filters such as user, activity, from, to, and search.
router.get(
  '/',
  asyncHandler(auditController.listEntries)
);

module.exports = router;
