'use strict';

const express = require('express');

const reportsController = require('../controllers/reports.controller');
const requireAuth = require('../middleware/require-auth');
const requirePermission = require('../middleware/require-permission');
const asyncHandler = require('../utils/async-handler');

const router = express.Router();

router.use(requireAuth);

router.get(
  '/weekly',
  requirePermission('Weekly reports'),
  asyncHandler(reportsController.getWeeklyReport)
);

router.get(
  '/monthly',
  requirePermission('Monthly reports'),
  asyncHandler(reportsController.getMonthlyReport)
);

router.get(
  '/annual',
  requirePermission('Annual reports'),
  asyncHandler(reportsController.getAnnualReport)
);

module.exports = router;
