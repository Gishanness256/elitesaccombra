'use strict';

const express = require('express');

const savingsController = require('../controllers/savings.controller');
const requireAuth = require('../middleware/require-auth');
const requirePermission = require('../middleware/require-permission');
const validate = require('../middleware/validate');
const asyncHandler = require('../utils/async-handler');
const { createSavingsSchema } = require('../validators/savings.schemas');

const router = express.Router();
const acknowledgeSavings = requirePermission('Acknowledge savings/deposits');

router.use(requireAuth);

router.get(
  '/',
  asyncHandler(savingsController.listTransactions)
);

router.get(
  '/:id',
  asyncHandler(savingsController.getTransactionById)
);

router.post(
  '/',
  acknowledgeSavings,
  validate(createSavingsSchema),
  asyncHandler(savingsController.createTransaction)
);

module.exports = router;
