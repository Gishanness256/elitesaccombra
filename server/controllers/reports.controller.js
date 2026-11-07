'use strict';

const reportsService = require('../services/reports.service');

function httpError(status, code, message) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function utcDateString(date) {
  return date.toISOString().slice(0, 10);
}

function parseDate(value, field) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw httpError(400, 'VALIDATION_ERROR', `${field} must use YYYY-MM-DD format.`);
  }

  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || utcDateString(date) !== value) {
    throw httpError(400, 'VALIDATION_ERROR', `${field} must be a valid calendar date.`);
  }

  return date;
}

function getWeeklyPeriod(value) {
  const date = value == null
    ? new Date(`${utcDateString(new Date())}T00:00:00.000Z`)
    : parseDate(value, 'date');

  const from = new Date(date);
  const day = (from.getUTCDay() + 6) % 7; // Monday is day 0.
  from.setUTCDate(from.getUTCDate() - day);

  const to = new Date(from);
  to.setUTCDate(to.getUTCDate() + 6);

  return { from: utcDateString(from), to: utcDateString(to) };
}

function getMonthlyPeriod(value) {
  const month = value == null
    ? utcDateString(new Date()).slice(0, 7)
    : value;

  if (typeof month !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    throw httpError(400, 'VALIDATION_ERROR', 'month must use YYYY-MM format.');
  }

  const [year, monthNumber] = month.split('-').map(Number);
  const from = new Date(Date.UTC(year, monthNumber - 1, 1));
  const to = new Date(Date.UTC(year, monthNumber, 0));

  return { month, from: utcDateString(from), to: utcDateString(to) };
}

function getAnnualPeriod(value) {
  const year = value == null
    ? new Date().getUTCFullYear()
    : Number(value);

  if (!Number.isInteger(year) || year < 1900 || year > 9999) {
    throw httpError(400, 'VALIDATION_ERROR', 'year must be a valid four-digit year.');
  }

  return {
    year,
    from: `${year}-01-01`,
    to: `${year}-12-31`
  };
}

function ensureServiceMethod(name) {
  if (typeof reportsService[name] !== 'function') {
    throw new Error(`reports.service.js must implement ${name}().`);
  }
}

async function getWeeklyReport(req, res) {
  ensureServiceMethod('getWeeklyReport');

  const period = getWeeklyPeriod(req.query.date);
  const report = await reportsService.getWeeklyReport({
    ...period,
    user: req.user
  });

  res.status(200).json({
    data: { period, report }
  });
}

async function getMonthlyReport(req, res) {
  ensureServiceMethod('getMonthlyReport');

  const period = getMonthlyPeriod(req.query.month);
  const report = await reportsService.getMonthlyReport({
    ...period,
    user: req.user
  });

  res.status(200).json({
    data: { period, report }
  });
}

async function getAnnualReport(req, res) {
  ensureServiceMethod('getAnnualReport');

  const period = getAnnualPeriod(req.query.year);
  const report = await reportsService.getAnnualReport({
    ...period,
    user: req.user
  });

  res.status(200).json({
    data: { period, report }
  });
}

module.exports = {
  getWeeklyReport,
  getMonthlyReport,
  getAnnualReport
};