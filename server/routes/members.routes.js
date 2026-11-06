'use strict';

const express = require('express');

const membersController = require('../controllers/members.controller');
const requireAuth = require('../middleware/require-auth');
const requirePermission = require('../middleware/require-permission');
const validate = require('../middleware/validate');
const asyncHandler = require('../utils/async-handler');
const {
  createMemberSchema,
  updateMemberSchema
} = require('../validators/members.schemas');

const router = express.Router();
const manageMembers = requirePermission('Create/remove member accounts');

router.use(requireAuth);

router.get(
  '/',
  asyncHandler(membersController.listMembers)
);

router.get(
  '/:id',
  asyncHandler(membersController.getMemberById)
);

router.post(
  '/',
  manageMembers,
  validate(createMemberSchema),
  asyncHandler(membersController.createMember)
);

router.patch(
  '/:id',
  manageMembers,
  validate(updateMemberSchema),
  asyncHandler(membersController.updateMember)
);

router.delete(
  '/:id',
  manageMembers,
  asyncHandler(membersController.deleteMember)
);

module.exports = router;
