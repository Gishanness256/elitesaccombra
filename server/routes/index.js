'use strict';

const express = require('express');

const router = express.Router();

const authRoutes = require('./auth.routes');
const usersRoutes = require('./users.routes');
const membersRoutes = require('./members.routes');
const savingsRoutes = require('./savings.routes');
const accountsRoutes = require('./accounts.routes');
const loansRoutes = require('./loans.routes');
const reportsRoutes = require('./reports.routes');
const regulatoryRoutes = require('./regulatory.routes');
const auditRoutes = require('./audit.routes');

router.use('/auth', authRoutes);
router.use('/users', usersRoutes);
router.use('/members', membersRoutes);
router.use('/savings', savingsRoutes);
router.use('/accounts', accountsRoutes);
router.use('/loans', loansRoutes);
router.use('/reports', reportsRoutes);
router.use('/regulatory', regulatoryRoutes);
router.use('/audit', auditRoutes);

module.exports = router;
