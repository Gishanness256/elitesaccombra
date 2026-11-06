'use strict';

const express = require('express');

const authController = require('../controllers/auth.controller');
const requireAuth = require('../middleware/require-auth');
const validate = require('../middleware/validate');
const asyncHandler = require('../utils/async-handler');
const { loginSchema } = require('../validators/auth.schemas');

const router = express.Router();

// The app mounts the shared rate limiter under /api/v1.
router.post(
  '/login',
  validate(loginSchema),
  asyncHandler(authController.login)
);

router.post(
  '/logout',
  requireAuth,
  asyncHandler(authController.logout)
);

router.get(
  '/me',
  requireAuth,
  asyncHandler(authController.getCurrentUser)
);

module.exports = router;
