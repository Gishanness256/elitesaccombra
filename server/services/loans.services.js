'use strict';

const crypto = require('node:crypto');
const database = require('../config/database');

const STAFF_ROLES = new Set([
  'Admin',
  'Treasurer',
  'Credit Supervisor',
  'Credit Officer'
]);

const DECISIONS = new Set(['Approved', 'Rejected', 'On Hold']);

function httpError(status, code, message) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function requireUser(user) {
  if (!user || user.id == null || typeof user.role !== 'string') {
    throw httpError(401, 'UNAUTHENTICATED', 'Authentication is required.');
  }
}

function isStaff(user) {
  return STAFF_ROLES.has(user.role);
}

function requireStaff(user, message = 'You do not have permission to perform this action.') {
  requireUser(user);
  if (!isStaff(user)) throw httpError(403, 'FORBIDDEN', message);
}

function userAccount(user) {
  return user.memberAccountId ||
    user.accountId ||
    user.acc ||
    null;
}

function requireAccountAccess(user, accountId) {
  requireUser(user);

  if (isStaff(user)) return;

  const ownAccount = userAccount(user);
  if (!ownAccount || String(ownAccount) !== String(accountId)) {
    throw httpError(403, 'FORBIDDEN', 'You may only access your own loan records.');
  }
}

function validateId(value, label) {
  const id = String(value ?? '').trim();
  if (!id || id.length > 128) {
    throw httpError(400, 'VALIDATION_ERROR', `A valid ${label} is required.`);
  }
  return id;
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

function validateDate(value, label) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw httpError(400, 'VALIDATION_ERROR', `${label} must use YYYY-MM-DD format.`);
  }

  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw httpError(400, 'VALIDATION_ERROR', `${label} must be a valid calendar date.`);
  }
  return value;
}

// Use integer cents for money calculations in application logic.
function toCents(value, label) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 1_000_000_000_000) {
    throw httpError(400, 'VALIDATION_ERROR', `${label} must be a positive amount.`);
  }

  const cents = Math.round(amount * 100);
  if (!Number.isSafeInteger(cents)) {
    throw httpError(400, 'VALIDATION_ERROR', `${label} is too large.`);
  }
  return cents;
}

function fromCents(cents) {
  return (cents / 100).toFixed(2);
}

function validateRate(value) {
  const rate = Number(value);
  if (!Number.isFinite(rate) || rate <= 0 || rate > 30) {
    throw httpError(400, 'VALIDATION_ERROR', 'Monthly interest rate must be greater than 0 and no more than 30%.');
  }

  // Store rates to two decimal places of percentage precision.
  const basisPoints = Math.round(rate * 100);
  return { rate: (basisPoints / 100).toFixed(2), basisPoints };
}

function accountFromRequest(request) {
  return request.accountId || request.acc || null;
}

function authorizeRecord(user, record) {
  const accountId = accountFromRequest(record);
  if (!accountId) {
    requireStaff(user);
    return;
  }
  requireAccountAccess(user, accountId);
}

function mapDatabaseError(error) {
  if (error && error.code === '23503') {
    return httpError(404, 'NOT_FOUND', 'The referenced member account or loan was not found.');
  }
  if (error && error.code === '23505') {
    return httpError(409, 'CONFLICT', 'The operation conflicts with an existing loan record.');
  }
  return error;
}

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
  created_at AS "createdAt"
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

async function listRequests({ limit = 50, offset = 0, status, user } = {}) {
  requireUser(user);
  const page = validatePagination({ limit, offset });

  const conditions = [];
  const values = [];

  if (status) {
    values.push(status);
    conditions.push(`status = $${values.length}`);
  }

  if (!isStaff(user)) {
    const accountId = userAccount(user);
    if (!accountId) {
      throw httpError(403, 'FORBIDDEN', 'Your account is not linked to a member record.');
    }
    values.push(String(accountId));
    conditions.push(`account_id = $${values.length}`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const countValues = [...values];
  values.push(page.limit, page.offset);

  const [rows, count] = await Promise.all([
    database.query(
      `SELECT ${REQUEST_COLUMNS}
         FROM loan_requests
         ${where}
        ORDER BY created_at DESC, id DESC
        LIMIT $${values.length - 1} OFFSET $${values.length}`,
      values
    ),
    database.query(
      `SELECT COUNT(*)::int AS total FROM loan_requests ${where}`,
      countValues
    )
  ]);

  return { requests: rows.rows, total: count.rows[0].total };
}

async function createRequest(input) {
  const {
    applicantType,
    accountId,
    applicantName,
    telephone,
    email = null,
    address = null,
    nin = null,
    category,
    termMonths,
    amount,
    monthlyRate,
    date,
    user
  } = input || {};

  requireUser(user);

  if (!['member', 'non-member'].includes(applicantType)) {
    throw httpError(400, 'VALIDATION_ERROR', 'Applicant type must be member or non-member.');
  }

  if (applicantType === 'non-member' && !isStaff(user)) {
    throw httpError(403, 'FORBIDDEN', 'Only authorized staff may submit a non-member loan request.');
  }

  if (applicantType === 'member') {
    if (!accountId) {
      throw httpError(400, 'VALIDATION_ERROR', 'A member account is required.');
    }
    requireAccountAccess(user, accountId);
  }

  if (!Number.isInteger(termMonths) || termMonths < 1 || termMonths > 60) {
    throw httpError(400, 'VALIDATION_ERROR', 'Loan term must be from 1 to 60 months.');
  }

  const principalCents = toCents(amount, 'Loan amount');
  const rate = validateRate(monthlyRate);
  const requestDate = validateDate(date, 'Request date');

  try {
    return await database.transaction(async (client) => {
      if (applicantType === 'member') {
        const member = await client.query(
          'SELECT acc FROM members WHERE acc = $1 FOR SHARE',
          [String(accountId)]
        );
        if (!member.rowCount) throw httpError(404, 'NOT_FOUND', 'Member account not found.');
      }

      const result = await client.query(
        `INSERT INTO loan_requests
          (ref, account_id, applicant_type, applicant_name, telephone, email,
           address, nin, category, term_months, amount, monthly_rate, request_date,
           status, requested_by, created_at, updated_at)
         VALUES
          ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::date,
           'Pending', $14, NOW(), NOW())
         RETURNING ${REQUEST_COLUMNS}`,
        [
          `LR-${crypto.randomUUID()}`,
          applicantType === 'member' ? String(accountId) : null,
          applicantType,
          applicantName,
          telephone,
          email,
          address,
          nin,
          category,
          termMonths,
          fromCents(principalCents),
          rate.rate,
          requestDate,
          String(user.id)
        ]
      );

      return result.rows[0];
    });
  } catch (error) {
    throw mapDatabaseError(error);
  }
}

async function getRequest({ requestId, user } = {}) {
  requireUser(user);

  const result = await database.query(
    `SELECT ${REQUEST_COLUMNS}
       FROM loan_requests
      WHERE id::text = $1 OR ref = $1
      LIMIT 1`,
    [validateId(requestId, 'request ID')]
  );

  const request = result.rows[0];
  if (!request) return null;
  authorizeRecord(user, request);
  return request;
}

async function decideRequest({ requestId, status, remark = null, user } = {}) {
  requireStaff(user, 'You do not have permission to decide loan requests.');

  if (!DECISIONS.has(status)) {
    throw httpError(400, 'VALIDATION_ERROR', 'Decision must be Approved, Rejected, or On Hold.');
  }

  try {
    return await database.transaction(async (client) => {
      const locked = await client.query(
        `SELECT ${REQUEST_COLUMNS}
           FROM loan_requests
          WHERE id::text = $1 OR ref = $1
          FOR UPDATE`,
        [validateId(requestId, 'request ID')]
      );

      const request = locked.rows[0];
      if (!request) return null;

      if (request.status !== 'Pending' && request.status !== 'On Hold') {
        throw httpError(409, 'INVALID_STATE', 'Only pending or on-hold requests can be decided.');
      }

      const updated = await client.query(
        `UPDATE loan_requests
            SET status = $2,
                remark = $3,
                decided_by = $4,
                decided_at = NOW(),
                updated_at = NOW()
          WHERE id = $1
          RETURNING ${REQUEST_COLUMNS}`,
        [request.id, status, remark, String(user.id)]
      );

      if (status === 'Approved') {
        const principalCents = toCents(request.amount, 'Loan amount');
        const monthlyRate = validateRate(request.monthlyRate).basisPoints;
        const interestCents = Math.round(
          principalCents * monthlyRate * Number(request.termMonths) / 10000
        );
        const totalDueCents = principalCents + interestCents;

        await client.query(
          `INSERT INTO loans
            (ref, request_id, account_id, borrower_name, telephone, category,
             term_months, principal, monthly_rate, total_due, outstanding_balance,
             outstanding_interest, disbursed_at, status, created_at, updated_at)
           VALUES
            ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10, $11,
             CURRENT_DATE, 'Active', NOW(), NOW())`,
          [
            `LN-${crypto.randomUUID()}`,
            request.id,
            request.accountId,
            request.applicantName,
            request.telephone,
            request.category,
            request.termMonths,
            fromCents(principalCents),
            request.monthlyRate,
            fromCents(totalDueCents),
            fromCents(interestCents)
          ]
        );
      }

      return updated.rows[0];
    });
  } catch (error) {
    throw mapDatabaseError(error);
  }
}

async function listLoans({ limit = 50, offset = 0, status, accountId, user } = {}) {
  requireUser(user);
  const page = validatePagination({ limit, offset });

  const conditions = [];
  const values = [];

  if (status) {
    values.push(status);
    conditions.push(`status = $${values.length}`);
  }

  if (!isStaff(user)) {
    const ownAccount = userAccount(user);
    if (!ownAccount) {
      throw httpError(403, 'FORBIDDEN', 'Your account is not linked to a member record.');
    }
    if (accountId && String(accountId) !== String(ownAccount)) {
      throw httpError(403, 'FORBIDDEN', 'You may only access your own loan records.');
    }
    values.push(String(ownAccount));
    conditions.push(`account_id = $${values.length}`);
  } else if (accountId) {
    values.push(String(accountId));
    conditions.push(`account_id = $${values.length}`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const countValues = [...values];
  values.push(page.limit, page.offset);

  const [rows, count] = await Promise.all([
    database.query(
      `SELECT ${LOAN_COLUMNS}
         FROM loans
         ${where}
        ORDER BY created_at DESC, id DESC
        LIMIT $${values.length - 1} OFFSET $${values.length}`,
      values
    ),
    database.query(`SELECT COUNT(*)::int AS total FROM loans ${where}`, countValues)
  ]);

  return { loans: rows.rows, total: count.rows[0].total };
}

async function getLoan({ loanId, user } = {}) {
  requireUser(user);

  const result = await database.query(
    `SELECT ${LOAN_COLUMNS}
       FROM loans
      WHERE id::text = $1 OR ref = $1
      LIMIT 1`,
    [validateId(loanId, 'loan ID')]
  );

  const loan = result.rows[0];
  if (!loan) return null;
  authorizeRecord(user, loan);
  return loan;
}

async function listRepayments({ loanId, limit = 50, offset = 0, user } = {}) {
  requireUser(user);
  const page = validatePagination({ limit, offset });
  const id = validateId(loanId, 'loan ID');

  const loanResult = await database.query(
    `SELECT id, account_id AS "accountId"
       FROM loans
      WHERE id::text = $1 OR ref = $1
      LIMIT 1`,
    [id]
  );

  const loan = loanResult.rows[0];
  if (!loan) return { repayments: [], total: 0 };
  authorizeRecord(user, loan);

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

async function createRepayment({ loanId, date, amount, type = 'Installment', user } = {}) {
  requireStaff(user, 'You do not have permission to record loan repayments.');

  const id = validateId(loanId, 'loan ID');
  const paymentDate = validateDate(date, 'Payment date');
  const paymentCents = toCents(amount, 'Payment amount');

  try {
    return await database.transaction(async (client) => {
      const loanResult = await client.query(
        `SELECT id, ref, account_id AS "accountId", principal,
                total_due AS "totalDue",
                outstanding_balance AS "outstandingBalance",
                outstanding_interest AS "outstandingInterest",
                status
           FROM loans
          WHERE id::text = $1 OR ref = $1
          FOR UPDATE`,
        [id]
      );

      const loan = loanResult.rows[0];
      if (!loan) return null;
      if (loan.status !== 'Active') {
        throw httpError(409, 'INVALID_STATE', 'Repayments can only be recorded for active loans.');
      }

      const balanceCents = Math.round(Number(loan.outstandingBalance) * 100);
      const interestCents = Math.round(Number(loan.outstandingInterest) * 100);

      if (!Number.isSafeInteger(balanceCents) || balanceCents <= 0) {
        throw new Error('Loan has an invalid outstanding balance.');
      }
      if (paymentCents > balanceCents) {
        throw httpError(409, 'OVERPAYMENT', 'Payment exceeds the outstanding loan balance.');
      }

      const interestPaidCents = Math.min(paymentCents, interestCents);
      const principalPaidCents = paymentCents - interestPaidCents;
      const newBalanceCents = balanceCents - paymentCents;
      const newInterestCents = interestCents - interestPaidCents;
      const newStatus = newBalanceCents === 0 ? 'Paid' : 'Active';

      const repaymentResult = await client.query(
        `INSERT INTO loan_repayments
          (loan_id, payment_date, amount, principal_paid, interest_paid,
           balance_after, type, recorded_by, created_at)
         VALUES
          ($1, $2::date, $3, $4, $5, $6, $7, $8, NOW())
         RETURNING ${REPAYMENT_COLUMNS}`,
        [
          loan.id,
          paymentDate,
          fromCents(paymentCents),
          fromCents(principalPaidCents),
          fromCents(interestPaidCents),
          fromCents(newBalanceCents),
          type,
          String(user.id)
        ]
      );

      const updatedLoan = await client.query(
        `UPDATE loans
            SET outstanding_balance = $2,
                outstanding_interest = $3,
                status = $4,
                updated_at = NOW()
          WHERE id = $1
          RETURNING ${LOAN_COLUMNS}`,
        [
          loan.id,
          fromCents(newBalanceCents),
          fromCents(newInterestCents),
          newStatus
        ]
      );

      return {
        repayment: repaymentResult.rows[0],
        loan: updatedLoan.rows[0]
      };
    });
  } catch (error) {
    throw mapDatabaseError(error);
  }
}

module.exports = {
  listRequests,
  createRequest,
  getRequest,
  decideRequest,
  listLoans,
  getLoan,
  listRepayments,
  createRepayment
};