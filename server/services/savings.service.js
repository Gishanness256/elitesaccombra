'use strict';

const crypto = require('node:crypto');
const database = require('../config/database');

const STAFF_ROLES = new Set([
  'Admin',
  'Treasurer',
  'Credit Supervisor',
  'Credit Officer'
]);

function httpError(status, code, message) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function requireUser(user) {
  if (!user || user.id == null || !user.role) {
    throw httpError(401, 'UNAUTHENTICATED', 'Authentication is required.');
  }
}

function requireStaff(user) {
  requireUser(user);

  if (!STAFF_ROLES.has(user.role)) {
    throw httpError(403, 'FORBIDDEN', 'You do not have permission to access savings records.');
  }
}

function validateId(value) {
  const id = String(value ?? '').trim();
  if (!id || id.length > 128) {
    throw httpError(400, 'VALIDATION_ERROR', 'A valid transaction ID is required.');
  }
  return id;
}

function validateAccount(value) {
  const account = String(value ?? '').trim();
  if (!account || account.length > 64) {
    throw httpError(400, 'VALIDATION_ERROR', 'A valid member account number is required.');
  }
  return account;
}

function validateDate(value, field) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw httpError(400, 'VALIDATION_ERROR', `${field} must use YYYY-MM-DD format.`);
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw httpError(400, 'VALIDATION_ERROR', `${field} must be a valid calendar date.`);
  }

  return value;
}

function validatePagination({ limit = 50, offset = 0 } = {}) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw httpError(400, 'VALIDATION_ERROR', 'limit must be an integer from 1 to 100.');
  }
  if (!Number.isInteger(offset) || offset < 0) {
    throw httpError(400, 'VALIDATION_ERROR', 'offset must be a non-negative integer.');
  }

  return { limit, offset };
}

function mapDatabaseError(error) {
  if (error && error.code === '23503') {
    return httpError(400, 'INVALID_ACCOUNT', 'The specified member account does not exist.');
  }

  if (error && error.code === '23505') {
    return httpError(409, 'CONFLICT', 'The savings transaction conflicts with an existing record.');
  }

  return error;
}

const TRANSACTION_COLUMNS = `
  id,
  ref,
  acc,
  amt,
  date,
  w,
  ch,
  slip,
  rm,
  ini,
  created_at AS "createdAt"
`;

async function listTransactions({ limit = 50, offset = 0, filters = {}, user } = {}) {
  requireStaff(user);
  const page = validatePagination({ limit, offset });

  const conditions = [];
  const values = [];

  if (filters.acc) {
    values.push(validateAccount(filters.acc));
    conditions.push(`acc = $${values.length}`);
  }
  if (filters.from) {
    values.push(validateDate(filters.from, 'from'));
    conditions.push(`date >= $${values.length}::date`);
  }
  if (filters.to) {
    values.push(validateDate(filters.to, 'to'));
    conditions.push(`date <= $${values.length}::date`);
  }

  if (filters.from && filters.to && filters.from > filters.to) {
    throw httpError(400, 'VALIDATION_ERROR', 'from must not be later than to.');
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const countValues = [...values];
  values.push(page.limit, page.offset);

  const [rowsResult, countResult] = await Promise.all([
    database.query(
      `SELECT ${TRANSACTION_COLUMNS}
         FROM savings_transactions
         ${whereClause}
        ORDER BY date DESC, created_at DESC, id DESC
        LIMIT $${values.length - 1} OFFSET $${values.length}`,
      values
    ),
    database.query(
      `SELECT COUNT(*)::int AS total
         FROM savings_transactions
         ${whereClause}`,
      countValues
    )
  ]);

  return {
    transactions: rowsResult.rows,
    total: countResult.rows[0].total
  };
}

async function getTransactionById({ id, user } = {}) {
  requireStaff(user);

  const result = await database.query(
    `SELECT ${TRANSACTION_COLUMNS}
       FROM savings_transactions
      WHERE id::text = $1
      LIMIT 1`,
    [validateId(id)]
  );

  return result.rows[0] || null;
}

async function createTransaction({
  acc,
  amt,
  date,
  w = false,
  ch = null,
  slip = null,
  rm = null,
  user
} = {}) {
  requireStaff(user);

  const account = validateAccount(acc);
  const transactionDate = validateDate(date, 'date');
  const amount = Number(amt);

  if (!Number.isFinite(amount) || amount <= 0 || amount > 1_000_000_000_000) {
    throw httpError(400, 'VALIDATION_ERROR', 'Amount must be a positive number.');
  }
  if (typeof w !== 'boolean') {
    throw httpError(400, 'VALIDATION_ERROR', 'Withdrawal flag must be boolean.');
  }

  try {
    return await database.transaction(async (client) => {
      // Lock the member row so concurrent withdrawals for this account cannot
      // both pass the balance check.
      const memberResult = await client.query(
        `SELECT acc
           FROM members
          WHERE acc = $1
          FOR UPDATE`,
        [account]
      );

      if (!memberResult.rowCount) {
        throw httpError(404, 'NOT_FOUND', 'Member account not found.');
      }

      const balanceResult = await client.query(
        `SELECT COALESCE(
                  SUM(CASE WHEN w THEN -amt ELSE amt END),
                  0
                ) AS balance
           FROM savings_transactions
          WHERE acc = $1`,
        [account]
      );

      const balance = Number(balanceResult.rows[0].balance);
      if (!Number.isFinite(balance)) {
        throw new Error('Could not calculate the account savings balance.');
      }
      if (w && amount > balance) {
        throw httpError(409, 'INSUFFICIENT_FUNDS', 'Withdrawal exceeds the available savings balance.');
      }

      const ref = `SV-${crypto.randomUUID()}`;
      const result = await client.query(
        `INSERT INTO savings_transactions
          (ref, acc, amt, date, w, ch, slip, rm, ini, created_at)
         VALUES
          ($1, $2, $3, $4::date, $5, $6, $7, $8, $9, NOW())
         RETURNING ${TRANSACTION_COLUMNS}`,
        [
          ref,
          account,
          amount,
          transactionDate,
          w,
          ch,
          slip,
          rm,
          user.initials || user.ini || null
        ]
      );

      return result.rows[0];
    });
  } catch (error) {
    throw mapDatabaseError(error);
  }
}

module.exports = {
  listTransactions,
  getTransactionById,
  createTransaction
};