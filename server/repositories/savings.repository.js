'use strict';

const database = require('../config/database');

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

function validatePagination({ limit = 50, offset = 0 } = {}) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new TypeError('limit must be an integer from 1 to 100.');
  }
  if (!Number.isInteger(offset) || offset < 0) {
    throw new TypeError('offset must be a non-negative integer.');
  }
  return { limit, offset };
}

function requireAccount(value) {
  const account = String(value ?? '').trim();
  if (!account || account.length > 64) {
    throw new TypeError('A valid member account number is required.');
  }
  return account;
}

function requireId(value) {
  const id = String(value ?? '').trim();
  if (!id || id.length > 128) {
    throw new TypeError('A valid transaction ID is required.');
  }
  return id;
}

function queryable(client) {
  return client || database;
}

async function withTransaction(callback) {
  if (typeof database.transaction !== 'function') {
    throw new Error('database must implement transaction(callback).');
  }
  return database.transaction(callback);
}

async function listTransactions({
  limit = 50,
  offset = 0,
  acc,
  from,
  to
} = {}) {
  const page = validatePagination({ limit, offset });
  const conditions = [];
  const values = [];

  if (acc != null) {
    values.push(requireAccount(acc));
    conditions.push(`acc = $${values.length}`);
  }
  if (from != null) {
    values.push(from);
    conditions.push(`date >= $${values.length}::date`);
  }
  if (to != null) {
    values.push(to);
    conditions.push(`date <= $${values.length}::date`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const countValues = [...values];
  const rowsValues = [...values, page.limit, page.offset];

  const [rowsResult, countResult] = await Promise.all([
    database.query(
      `SELECT ${TRANSACTION_COLUMNS}
         FROM savings_transactions
         ${where}
        ORDER BY date DESC, created_at DESC, id DESC
        LIMIT $${rowsValues.length - 1} OFFSET $${rowsValues.length}`,
      rowsValues
    ),
    database.query(
      `SELECT COUNT(*)::int AS total
         FROM savings_transactions
         ${where}`,
      countValues
    )
  ]);

  return {
    transactions: rowsResult.rows,
    total: countResult.rows[0].total
  };
}

async function findTransactionById(id, { client } = {}) {
  const result = await queryable(client).query(
    `SELECT ${TRANSACTION_COLUMNS}
       FROM savings_transactions
      WHERE id::text = $1 OR ref = $1
      LIMIT 1`,
    [requireId(id)]
  );

  return result.rows[0] || null;
}

async function findMemberByAccount(acc, { client, forUpdate = false } = {}) {
  const lockClause = forUpdate ? 'FOR UPDATE' : '';
  const result = await queryable(client).query(
    `SELECT id, acc, first, last
       FROM members
      WHERE acc = $1
      LIMIT 1
      ${lockClause}`,
    [requireAccount(acc)]
  );

  return result.rows[0] || null;
}

async function getAccountBalance(acc, { client } = {}) {
  const result = await queryable(client).query(
    `SELECT COALESCE(
              SUM(CASE WHEN w THEN -amt ELSE amt END),
              0
            ) AS balance
       FROM savings_transactions
      WHERE acc = $1`,
    [requireAccount(acc)]
  );

  return result.rows[0].balance;
}

async function insertTransaction(
  {
    ref,
    acc,
    amt,
    date,
    w,
    ch = null,
    slip = null,
    rm = null,
    ini = null
  },
  { client } = {}
) {
  if (!client) {
    throw new Error('insertTransaction requires a transaction client.');
  }

  const result = await client.query(
    `INSERT INTO savings_transactions
       (ref, acc, amt, date, w, ch, slip, rm, ini, created_at)
     VALUES
       ($1, $2, $3, $4::date, $5, $6, $7, $8, $9, NOW())
     RETURNING ${TRANSACTION_COLUMNS}`,
    [ref, requireAccount(acc), amt, date, w, ch, slip, rm, ini]
  );

  return result.rows[0] || null;
}

module.exports = {
  withTransaction,
  listTransactions,
  findTransactionById,
  findMemberByAccount,
  getAccountBalance,
  insertTransaction
};