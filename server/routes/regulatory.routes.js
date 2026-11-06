'use strict';

const express = require('express');

const regulatoryController = require('../controllers/regulatory.controller');
const requireAuth = require('../middleware/require-auth');
const asyncHandler = require('../utils/async-handler');

const router = express.Router();

const RETURN_ROLES = new Set(['Admin', 'Treasurer', 'Credit Supervisor']);
const CONFIG_ROLES = new Set(['Admin', 'Treasurer']);

function requireRoles(allowedRoles) {
  return function roleGuard(req, res, next) {
    const role = req.user && req.user.role;

    if (!role || !allowedRoles.has(role)) {
      return res.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message: 'You do not have permission to access this resource.'
        }
      });
    }

    return next();
  };
}

router.use(requireAuth);

// Generate/read a return for a reporting period.
// Query parameters can include basis (m, mom, yoy), month (YYYY-MM),
// and months (3, 6, or 12).
router.get(
  '/returns',
  requireRoles(RETURN_ROLES),
  asyncHandler(regulatoryController.getReturn)
);

// Retrieve monthly financial inputs for a specific month (YYYY-MM).
router.get(
  '/inputs/:month',
  requireRoles(RETURN_ROLES),
  asyncHandler(regulatoryController.getMonthlyInputs)
);

// Save or replace monthly financial inputs.
router.put(
  '/inputs/:month',
  requireRoles(CONFIG_ROLES),
  asyncHandler(regulatoryController.saveMonthlyInputs)
);

// Retrieve regulator details and benchmark settings.
router.get(
  '/settings',
  requireRoles(RETURN_ROLES),
  asyncHandler(regulatoryController.getSettings)
);

// Update regulator details, benchmarks, and provisioning rates.
router.put(
  '/settings',
  requireRoles(CONFIG_ROLES),
  asyncHandler(regulatoryController.updateSettings)
);

module.exports = router;
