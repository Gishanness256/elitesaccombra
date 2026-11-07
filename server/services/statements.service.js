'use strict';

const database = require('../config/database');

const STAFF_ROLES = new Set([
  'Admin',
  'Treasurer',
  'Credit Supervisor',
  'Credit Officer'
]);

const MAX_RANGE_DAYS = 366;

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

function getUserAccount(user) {
  return user.memberAccountId || user.accountId || user.acc || null;
}

function assertAccountAccess(user, accountId) {
  requireUser(user);

  if (STAFF_ROLES.has(user.role)) return;

  const ownAccount = getUserAccount(user);
  if (!ownAccount || String(ownAccount) !== String(accountId)) {
    throw httpError(403, 'FORBIDDEN', 'You may only access your own account statement.');
  }
}

function validateAccountId(value) {
  const accountId = String(value ?? '').trim();

  if (!accountId || accountId.length > 64) {
    throw httpError(400, 'VALIDATION_ERROR', 'A valid account ID is required.');
  }

  return accountId;
}

function parseDate(value, field) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw httpError(400, 'VALIDATION_ERROR', `${field} must use YYYY-MM-DD format.`);
  }

  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw httpError(400, 'VALIDATION_ERROR', `${field} must be a valid calendar date.`);
  }

  return date;
}

function dateString(date) {
  return date.toISOString().slice(0, 10);
}

function resolvePeriod(fromValue, toValue) {
  const today = new Date();
  const to = toValue == null
    ? new Date(`${dateString(today)}T00:00:00.000Z`)
    : parseDate(toValue, 'to');

  const defaultFrom = new Date(Date.UTC(
    to.getUTCFullYear(),
    to.getUTCMonth(),
    1
  ));

  const from = fromValue == null
    ? defaultFrom
    : parseDate(fromValue, 'from');

  if (from > to) {
    throw httpError(400, 'VALIDATION_ERROR', 'from must not be later than to.');
  }

  const rangeDays = Math.floor((to - from) / 86_400_000) + 1;
  if (rangeDays > MAX_RANGE_DAYS) {
    throw httpError(400, 'VALIDATION_ERROR', `Statement date range cannot exceed ${MAX_RANGE_DAYS} days.`);
  }

  const dayBeforeFrom = new Date(from);
  dayBeforeFrom.setUTCDate(dayBeforeFrom.getUTCDate() - 1);

  return {
    from: dateString(from),
    to: dateString(to),
    beforeFrom: dateString(dayBeforeFrom)
  };
}

function decimal(value) {
  // Keep PostgreSQL NUMERIC values as strings to avoid introducing
  // JavaScript floating-point rounding into statement totals.
  return value == null ? '0.00' : String(value);
}

async function getStatement({
  accountId: accountValue,
  from: fromValue,
  to: toValue,
  user
} = {}) {
  const accountId = validateAccountId(accountValue);
  assertAccountAccess(user, accountId);

  const period = resolvePeriod(fromValue, toValue);

  return database.transaction(async (client) => {
    const memberResult = await client.query(
      `SELECT acc, first, last
         FROM members
        WHERE acc = $1
        LIMIT 1`,
      [accountId]
    );

    const member = memberResult.rows[0];
    if (!member) {
      throw httpError(404, 'NOT_FOUND', 'Account not found.');
    }

    const savingsOpeningResult = await client.query(
      `SELECT COALESCE(
                SUM(CASE WHEN w THEN -amt ELSE amt END),
                0
              ) AS balance
         FROM savings_transactions
        WHERE acc = $1
          AND date < $2::date`,
      [accountId, period.from]
    );

    const savingsRowsResult = await client.query(
      `SELECT id,
              ref,
              date,
              CASE WHEN w THEN 'withdrawal' ELSE 'deposit' END AS type,
              amt AS amount,
              ch AS channel,
              slip,
              rm AS remarks,
              ini AS recorded_by
         FROM savings_transactions
        WHERE acc = $1
          AND date >= $2::date
          AND date <= $3::date
        ORDER BY date ASC, created_at ASC, id ASC`,
      [accountId, period.from, period.to]
    );

    const savingsClosingResult = await client.query(
      `SELECT COALESCE(
                SUM(CASE WHEN w THEN -amt ELSE amt END),
                0
              ) AS balance
         FROM savings_transactions
        WHERE acc = $1
          AND date <= $2::date`,
      [accountId, period.to]
    );

    const loanRowsResult = await client.query(
      `SELECT l.id,
              l.ref,
              l.category,
              l.principal,
              l.total_due AS "totalDue",
              l.disbursed_at::date AS "disbursedAt",
              l.status,
              COALESCE(
                (
                  SELECT r.balance_after
                    FROM loan_repayments r
                   WHERE r.loan_id = l.id
                     AND r.payment_date <= $2::date
                   ORDER BY r.payment_date DESC, r.created_at DESC, r.id DESC
                   LIMIT 1
                ),
                l.total_due
              ) AS "balanceAtPeriodEnd"
         FROM loans l
        WHERE l.account_id = $1
          AND l.disbursed_at::date <= $2::date
        ORDER BY l.disbursed_at ASC, l.created_at ASC, l.id ASC`,
      [accountId, period.to]
    );

    const disbursementsResult = await client.query(
      `SELECT id,
              ref,
              disbursed_at::date AS date,
              principal AS amount,
              category,
              status
         FROM loans
        WHERE account_id = $1
          AND disbursed_at::date >= $2::date
          AND disbursed_at::date <= $3::date
        ORDER BY disbursed_at ASC, created_at ASC, id ASC`,
      [accountId, period.from, period.to]
    );

    const repaymentsResult = await client.query(
      `SELECT r.id,
              l.ref AS "loanRef",
              r.payment_date AS date,
              r.amount,
              r.principal_paid AS "principalPaid",
              r.interest_paid AS "interestPaid",
              r.balance_after AS "balanceAfter",
              r.type,
              r.recorded_by AS "recordedBy"
         FROM loan_repayments r
         JOIN loans l ON l.id = r.loan_id
        WHERE l.account_id = $1
          AND r.payment_date >= $2::date
          AND r.payment_date <= $3::date
        ORDER BY r.payment_date ASC, r.created_at ASC, r.id ASC`,
      [accountId, period.from, period.to]
    );

    const savingsOpening = decimal(savingsOpeningResult.rows[0].balance);
    const savingsClosing = decimal(savingsClosingResult.rows[0].balance);

    return {
      account: {
        id: member.acc,
        name: [member.first, member.last].filter(Boolean).join(' ')
      },
      period: {
        from: period.from,
        to: period.to
      },
      savings: {
        openingBalance: savingsOpening,
        closingBalance: savingsClosing,
        transactions: savingsRowsResult.rows.map((row) => ({
          ...row,
          amount: decimal(row.amount)
        }))
      },
      loans: {
        disbursements: disbursementsResult.rows.map((row) => ({
          ...row,
          amount: decimal(row.amount)
        })),
        repayments: repaymentsResult.rows.map((row) => ({
          ...row,
          amount: decimal(row.amount),
          principalPaid: decimal(row.principalPaid),
          interestPaid: decimal(row.interestPaid),
          balanceAfter: decimal(row.balanceAfter)
        })),
        balancesAtPeriodEnd: loanRowsResult.rows.map((row) => ({
          ...row,
          principal: decimal(row.principal),
          totalDue: decimal(row.totalDue),
          balance: decimal(row.balanceAtPeriodEnd)
        }))
      }
    };
  });
}

module.exports = {
  getStatement
};