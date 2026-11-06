'use strict';

const express = require('express');

const usersController = require('../controllers/users.controller');
const requireAuth = require('../middleware/require-auth');
const requirePermission = require('../middleware/require-permission');
const asyncHandler = require('../utils/async-handler');

const router = express.Router();
const manageUsers = requirePermission('Create/remove system users');

router.use(requireAuth);

router.get(
  '/',
  manageUsers,
  asyncHandler(usersController.listUsers)
);

router.post(
  '/',
  manageUsers,
  asyncHandler(usersController.createUser)
);

router.get(
  '/:id',
  manageUsers,
  asyncHandler(usersController.getUserById)
);

router.patch(
  '/:id',
  manageUsers,
  asyncHandler(usersController.updateUser)
);

router.delete(
  '/:id',
  manageUsers,
  asyncHandler(usersController.deleteUser)
);

router.post(
  '/:id/credentials/reset',
  manageUsers,
  asyncHandler(usersController.resetCredentials)
);

module.exports = router;
