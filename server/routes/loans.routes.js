'use strict';

const express = require('express');

const loansController = require('../controllers/loans.controller');
const requireAuth = require('../middleware/require-auth');
const requirePermission = require('../middleware/require-permission');
const validate = require('../middleware/validate');
const asyncHandler = require('../utils/async-handler');
const {
  createLoanRequestSchema,
  decideLoanRequestSchema,
  createLoanRepaymentSchema
} = require('../validators/loans.schemas');

const router = express.Router();
const approveLoans = requirePermission('Approve loans');
const acknowledgeRepayments = requirePermission('Acknowledge loan repayments');

router.use(requireAuth);

// Keep the fixed /requests paths before /:loanId.
router.get(
  '/requests',
  asyncHandler(loansController.listRequests)
);

router.post(
  '/requests',
  validate(createLoanRequestSchema),
  asyncHandler(loansController.createRequest)
);

router.get(
  '/requests/:requestId',
  asyncHandler(loansController.getRequest)
);

router.patch(
  '/requests/:requestId/decision',
  approveLoans,
  validate(decideLoanRequestSchema),
  asyncHandler(loansController.decideRequest)
);

router.get(
  '/',
  asyncHandler(loansController.listLoans)
);

router.get(
  '/:loanId',
  asyncHandler(loansController.getLoan)
);

router.get(
  '/:loanId/repayments',
  asyncHandler(loansController.listRepayments)
);

router.post(
  '/:loanId/repayments',
  acknowledgeRepayments,
  validate(createLoanRepaymentSchema),
  asyncHandler(loansController.createRepayment)
);

module.exports = router;
