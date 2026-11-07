'use strict';

const database = require('../config/database');

const REQUEST_COLUMNS = `
  id,
  ref,
  account_id AS "accountId",
  applicant_type AS "applicantType",
  applicant_name AS "applicantName",
  telephone,
  email,
  address,
  nin,
  category,
  term_months AS "termMonths",
  amount,
  monthly_rate AS "monthlyRate",
  request_date AS date,
  status,
  remark,
  requested_by AS "requestedBy",
  decided_by AS "decidedBy",
  decided_at AS "decidedAt",
  created_at AS "createdAt",
  updated_at AS "updatedAt"
`;

const LOAN_COLUMNS = `
  id,
  ref,
  request_id AS "requestId",
  account_id AS "accountId",
  borrower_name AS "borrowerName",
  telephone,
  category,
  term_months AS "termMonths",
  principal,
  monthly_rate AS "monthlyRate",
  total_due AS "totalDue",
  outstanding_balance AS "outstandingBalance",
  outstanding_interest AS "outstandingInterest",
  disbursed_at AS "disbursedAt",
  status,
  created_at AS "createdAt",
  updated_at AS "updatedAt"
`;

const REPAYMENT_COLUMNS = `
  id,
  loan_id AS "loanId",
  payment_date AS date,
  amount,
  principal_paid AS "principalPaid",
  interest_paid AS "interestPaid",
  balance_after AS "balanceAfter",
  type,
  recorded_by AS "recordedBy",
  created_at AS "createdAt"
`;

function validatePagination({ limit = 50, offset = 0 } = {}) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new TypeError('limit must be an integer from 1 to 100.');
  }
  if (!Number.isInteger(offset) || offset < 0) {
    throw new TypeError('offset must be a non-negative integer.');
  }
  return { limit, offset };
}

function requireId(value, label = 'ID') {
  const id = String(value ?? '').trim();
  if (!id || id.length > 128) {
    throw new TypeError(`A valid ${label} is required.`);
  }
  return id;
}

function readClient(client) {
  return client || database;
}

function writeClient(client) {
  if (!client || typeof client.query !== 'function') {
    throw new TypeError('A transaction client is required for this write operation.');
  }
  return client;
}

async function withTransaction(callback) {
  if (typeof database.transaction !== 'function') {
    throw new Error('database must implement transaction(callback).');
  }
  return database.transaction(callback);
}

async function listRequests({
  limit = 50,
  offset = 0,
  status,
  accountId
} = {}) {
  const page = validatePagination({ limit, offset });
  const conditions = [];
  const values = [];

  if (status != null) {
    values.push(status);
    conditions.push(`status = $${values.length}`);
  }
  if (accountId != null) {
    values.push(String(accountId));
    conditions.push(`account_id = $${values.length}`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const countValues = [...values];
  const queryValues = [...values, page.limit, page.offset];

  const [rows, count] = await Promise.all([
    database.query(
      `SELECT ${REQUEST_COLUMNS}
         FROM loan_requests
         ${where}
        ORDER BY created_at DESC, id DESC
        LIMIT $${queryValues.length - 1} OFFSET $${queryValues.length}`,
      queryValues
    ),
    database.query(
      `SELECT COUNT(*)::int AS total FROM loan_requests ${where}`,
      countValues
    )
  ]);

  return { requests: rows.rows, total: count.rows[0].total };
}

async function findRequestById(id, { client, forUpdate = false } = {}) {
  const lock = forUpdate ? 'FOR UPDATE' : '';
  const result = await readClient(client).query(
    `SELECT ${REQUEST_COLUMNS}
       FROM loan_requests
      WHERE id::text = $1 OR ref = $1
      LIMIT 1
      ${lock}`,
    [requireId(id, 'request ID')]
  );

  return result.rows[0] || null;
}

async function insertRequest(input, { client } = {}) {
  const db = writeClient(client);
  const result = await db.query(
    `INSERT INTO loan_requests
       (ref, account_id, applicant_type, applicant_name, telephone, email,
        address, nin, category, term_months, amount, monthly_rate,
        request_date, status, requested_by, created_at, updated_at)
     VALUES
       ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
        $13::date, 'Pending', $14, NOW(), NOW())
     RETURNING ${REQUEST_COLUMNS}`,
    [
      input.ref,
      input.accountId ?? null,
      input.applicantType,
      input.applicantName,
      input.telephone,
      input.email ?? null,
      input.address ?? null,
      input.nin ?? null,
      input.category,
      input.termMonths,
      input.amount,
      input.monthlyRate,
      input.date,
      String(input.requestedBy)
    ]
  );

  return result.rows[0] || null;
}

async function updateRequestDecision(
  id,
  { status, remark = null, decidedBy },
  { client } = {}
) {
  const db = writeClient(client);
  const result = await db.query(
    `UPDATE loan_requests
        SET status = $2,
            remark = $3,
            decided_by = $4,
            decided_at = NOW(),
            updated_at = NOW()
      WHERE id = $1
      RETURNING ${REQUEST_COLUMNS}`,
    [
      requireId(id, 'request ID'),
      status,
      remark,
      String(decidedBy)
    ]
  );

  return result.rows[0] || null;
}

async function listLoans({
  limit = 50,
  offset = 0,
  status,
  accountId
} = {}) {
  const page = validatePagination({ limit, offset });
  const conditions = [];
  const values = [];

  if (status != null) {
    values.push(status);
    conditions.push(`status = $${values.length}`);
  }
  if (accountId != null) {
    values.push(String(accountId));
    conditions.push(`account_id = $${values.length}`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const countValues = [...values];
  const queryValues = [...values, page.limit, page.offset];

  const [rows, count] = await Promise.all([
    database.query(
      `SELECT ${LOAN_COLUMNS}
         FROM loans
         ${where}
        ORDER BY created_at DESC, id DESC
        LIMIT $${queryValues.length - 1} OFFSET $${queryValues.length}`,
      queryValues
    ),
    database.query(`SELECT COUNT(*)::int AS total FROM loans ${where}`, countValues)
  ]);

  return { loans: rows.rows, total: count.rows[0].total };
}

async function findLoanById(id, { client, forUpdate = false } = {}) {
  const lock = forUpdate ? 'FOR UPDATE' : '';
  const result = await readClient(client).query(
    `SELECT ${LOAN_COLUMNS}
       FROM loans
      WHERE id::text = $1 OR ref = $1
      LIMIT 1
      ${lock}`,
    [requireId(id, 'loan ID')]
  );

  return result.rows[0] || null;
}

async function insertLoan(input, { client } = {}) {
  const db = writeClient(client);
  const result = await db.query(
    `INSERT INTO loans
       (ref, request_id, account_id, borrower_name, telephone, category,
        term_months, principal, monthly_rate, total_due, outstanding_balance,
        outstanding_interest, disbursed_at, status, created_at, updated_at)
     VALUES
       ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10, $11,
        $12::date, $13, NOW(), NOW())
     RETURNING ${LOAN_COLUMNS}`,
    [
      input.ref,
      input.requestId,
      input.accountId ?? null,
      input.borrowerName,
      input.telephone,
      input.category,
      input.termMonths,
      input.principal,
      input.monthlyRate,
      input.totalDue,
      input.outstandingInterest,
      input.disbursedAt,
      input.status || 'Active'
    ]
  );

  return result.rows[0] || null;
}

async function updateLoanBalance(
  id,
  { outstandingBalance, outstandingInterest, status },
  { client } = {}
) {
  const db = writeClient(client);
  const result = await db.query(
    `UPDATE loans
        SET outstanding_balance = $2,
            outstanding_interest = $3,
            status = $4,
            updated_at = NOW()
      WHERE id = $1
      RETURNING ${LOAN_COLUMNS}`,
    [
      requireId(id, 'loan ID'),
      outstandingBalance,
      outstandingInterest,
      status
    ]
  );

  return result.rows[0] || null;
}

async function listRepayments({
  loanId,
  limit = 50,
  offset = 0
} = {}) {
  const page = validatePagination({ limit, offset });
  const id = requireId(loanId, 'loan ID');

  const loan = await findLoanById(id);
  if (!loan) return { repayments: [], total: 0 };

  const [rows, count] = await Promise.all([
    database.query(
      `SELECT ${REPAYMENT_COLUMNS}
         FROM loan_repayments
        WHERE loan_id = $1
        ORDER BY payment_date DESC, created_at DESC, id DESC
        LIMIT $2 OFFSET $3`,
      [loan.id, page.limit, page.offset]
    ),
    database.query(
      'SELECT COUNT(*)::int AS total FROM loan_repayments WHERE loan_id = $1',
      [loan.id]
    )
  ]);

  return { repayments: rows.rows, total: count.rows[0].total };
}

async function insertRepayment(input, { client } = {}) {
  const db = writeClient(client);
  const result = await db.query(
    `INSERT INTO loan_repayments
       (loan_id, payment_date, amount, principal_paid, interest_paid,
        balance_after, type, recorded_by, created_at)
     VALUES
       ($1, $2::date, $3, $4, $5, $6, $7, $8, NOW())
     RETURNING ${REPAYMENT_COLUMNS}`,
    [
      requireId(input.loanId, 'loan ID'),
      input.date,
      input.amount,
      input.principalPaid,
      input.interestPaid,
      input.balanceAfter,
      input.type,
      String(input.recordedBy)
    ]
  );

  return result.rows[0] || null;
}

module.exports = {
  withTransaction,
  listRequests,
  findRequestById,
  insertRequest,
  updateRequestDecision,
  listLoans,
  findLoanById,
  insertLoan,
  updateLoanBalance,
  listRepayments,
  insertRepayment
};