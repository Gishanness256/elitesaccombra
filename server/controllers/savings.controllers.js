'use strict';

const savingsService = require('../services/savings.service');

function httpError(status, code, message) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function requireRepositoryMethod(name) {
  if (typeof savingsService[name] !== 'function') {
    throw new Error(`savings.service.js must implement ${name}().`);
  }
}

function parsePagination(query) {
  const limit = query.limit == null ? 50 : Number(query.limit);
  const offset = query.offset == null ? 0 : Number(query.offset);

  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw httpError(400, 'VALIDATION_ERROR', 'limit must be an integer from 1 to 100.');
  }

  if (!Number.isInteger(offset) || offset < 0) {
    throw httpError(400, 'VALIDATION_ERROR', 'offset must be a non-negative integer.');
  }

  return { limit, offset };
}

function requireTransactionId(value) {
  const id = String(value || '').trim();
  if (!id || id.length > 128) {
    throw httpError(400, 'VALIDATION_ERROR', 'A valid transaction ID is required.');
  }
  return id;
}

function validateTransaction(body) {
  const acc = typeof body.acc === 'string' ? body.acc.trim() : '';
  if (!acc || acc.length > 64) {
    throw httpError(400, 'VALIDATION_ERROR', 'A valid member account number is required.');
  }

  const amt = Number(body.amt);
  if (!Number.isFinite(amt) || amt <= 0 || amt > 1_000_000_000_000) {
    throw httpError(400, 'VALIDATION_ERROR', 'Amount must be a positive number.');
  }

  const date = typeof body.date === 'string' ? body.date.trim() : '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw httpError(400, 'VALIDATION_ERROR', 'Date must use YYYY-MM-DD format.');
  }

  const parsedDate = new Date(`${date}T00:00:00.000Z`);
  if (
    Number.isNaN(parsedDate.getTime()) ||
    parsedDate.toISOString().slice(0, 10) !== date
  ) {
    throw httpError(400, 'VALIDATION_ERROR', 'Date must be a valid calendar date.');
  }

  const withdrawal = body.w === true || body.type === 'withdrawal';
  if (body.w !== undefined && typeof body.w !== 'boolean') {
    throw httpError(400, 'VALIDATION_ERROR', 'Transaction withdrawal flag must be boolean.');
  }
  if (
    body.type !== undefined &&
    !['deposit', 'withdrawal'].includes(String(body.type).toLowerCase())
  ) {
    throw httpError(400, 'VALIDATION_ERROR', 'Type must be deposit or withdrawal.');
  }

  const ch = body.ch == null ? null : String(body.ch).trim();
  const slip = body.slip == null ? null : String(body.slip).trim();
  const rm = body.rm == null ? null : String(body.rm).trim();

  if (ch && ch.length > 80) {
    throw httpError(400, 'VALIDATION_ERROR', 'Channel must be at most 80 characters.');
  }
  if (slip && slip.length > 100) {
    throw httpError(400, 'VALIDATION_ERROR', 'Slip number must be at most 100 characters.');
  }
  if (rm && rm.length > 1000) {
    throw httpError(400, 'VALIDATION_ERROR', 'Remarks must be at most 1000 characters.');
  }

  return {
    acc,
    amt,
    date,
    w: withdrawal,
    ch,
    slip,
    rm
  };
}

function publicTransaction(transaction) {
  if (!transaction) return null;

  // Return an explicit field allowlist rather than serializing database rows.
  return {
    id: transaction.id,
    ref: transaction.ref,
    acc: transaction.acc,
    amt: Number(transaction.amt),
    date: transaction.date,
    w: Boolean(transaction.w),
    ch: transaction.ch || null,
    slip: transaction.slip || null,
    rm: transaction.rm || null,
    ini: transaction.ini || null,
    createdAt: transaction.createdAt || transaction.created_at || null
  };
}

async function listTransactions(req, res) {
  requireRepositoryMethod('listTransactions');

  const page = parsePagination(req.query);
  const filters = {};

  if (req.query.account) {
    filters.acc = String(req.query.account).trim();
  }
  if (req.query.from) filters.from = String(req.query.from);
  if (req.query.to) filters.to = String(req.query.to);

  // The service must verify that the authenticated user can access the
  // requested account and that any date filters are valid.
  const result = await savingsService.listTransactions({
    ...page,
    filters,
    user: req.user
  });

  const transactions = Array.isArray(result)
    ? result
    : result && result.transactions;

  if (!Array.isArray(transactions)) {
    throw new Error('savings.service.listTransactions() must return an array or { transactions, total }.');
  }

  res.status(200).json({
    data: {
      transactions: transactions.map(publicTransaction),
      pagination: {
        limit: page.limit,
        offset: page.offset,
        total: Array.isArray(result) ? transactions.length : Number(result.total) || 0
      }
    }
  });
}

async function getTransactionById(req, res) {
  requireRepositoryMethod('getTransactionById');

  const transaction = await savingsService.getTransactionById({
    id: requireTransactionId(req.params.id),
    user: req.user
  });

  if (!transaction) {
    throw httpError(404, 'NOT_FOUND', 'Savings transaction not found.');
  }

  res.status(200).json({
    data: { transaction: publicTransaction(transaction) }
  });
}

async function createTransaction(req, res) {
  requireRepositoryMethod('createTransaction');

  const transaction = await savingsService.createTransaction({
    ...validateTransaction(req.body || {}),
    user: req.user
  });

  if (!transaction) {
    throw new Error('savings.service.createTransaction() did not return the created transaction.');
  }

  res.status(201).json({
    data: { transaction: publicTransaction(transaction) }
  });
}

module.exports = {
  listTransactions,
  getTransactionById,
  createTransaction
};
