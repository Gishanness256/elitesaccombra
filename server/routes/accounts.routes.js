'use strict';

const express = require('express');

const accountsController = require('../controllers/accounts.controller');
const requireAuth = require('../middleware/require-auth');
const asyncHandler = require('../utils/async-handler');

const router = express.Router();

router.use(requireAuth);

// Account and transaction data are sensitive. Enforce the caller's
// account-level access policy in the controller/service for each request.
router.get(
  '/',
  asyncHandler(accountsController.listAccounts)
);

router.get(
  '/:accountId',
  asyncHandler(accountsController.getAccount)
);

router.get(
  '/:accountId/statement',
  asyncHandler(accountsController.getStatement)
);

module.exports = router;
