'use strict';

const database = require('../config/database');

const MEMBER_COLUMNS = `
  id,
  acc,
  first,
  last,
  dob,
  addr,
  nin,
  tel,
  email,
  photo,
  created_at AS "createdAt",
  updated_at AS "updatedAt"
`;

const UPDATE_COLUMNS = Object.freeze({
  first: 'first',
  last: 'last',
  dob: 'dob',
  addr: 'addr',
  nin: 'nin',
  tel: 'tel',
  email: 'email',
  photo: 'photo'
});

function httpError(status, code, message) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function validateId(value) {
  const id = String(value ?? '').trim();
  if (!id || id.length > 128) {
    throw httpError(400, 'VALIDATION_ERROR', 'A valid member ID is required.');
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

function validateFields(fields, { allowEmpty = false } = {}) {
  if (!fields || typeof fields !== 'object' || Array.isArray(fields)) {
    throw httpError(400, 'VALIDATION_ERROR', 'Member fields must be an object.');
  }

  const entries = Object.entries(fields);
  if (!allowEmpty && entries.length === 0) {
    throw httpError(400, 'VALIDATION_ERROR', 'Provide at least one member field.');
  }

  for (const [key, value] of entries) {
    if (!Object.hasOwn(UPDATE_COLUMNS, key)) {
      throw httpError(400, 'VALIDATION_ERROR', `Unsupported member field: ${key}.`);
    }
    if (value !== null && typeof value !== 'string') {
      throw httpError(400, 'VALIDATION_ERROR', `${key} must be a string or null.`);
    }
  }

  return fields;
}

function mapDatabaseError(error) {
  if (error?.code === '23505') {
    const mapped = httpError(
      409,
      'CONFLICT',
      'A member with one of these details already exists.'
    );
    mapped.cause = error;
    return mapped;
  }

  if (error?.code === '23503') {
    const mapped = httpError(
      409,
      'MEMBER_IN_USE',
      'The member cannot be removed because financial records are linked to this account.'
    );
    mapped.cause = error;
    return mapped;
  }

  return error;
}

async function list({ limit = 50, offset = 0 } = {}) {
  const page = validatePagination({ limit, offset });

  const [rowsResult, countResult] = await Promise.all([
    database.query(
      `SELECT ${MEMBER_COLUMNS}
         FROM members
        ORDER BY created_at DESC, id DESC
        LIMIT $1 OFFSET $2`,
      [page.limit, page.offset]
    ),
    database.query('SELECT COUNT(*)::int AS total FROM members')
  ]);

  return {
    members: rowsResult.rows,
    total: countResult.rows[0].total
  };
}

async function findById(id) {
  const result = await database.query(
    `SELECT ${MEMBER_COLUMNS}
       FROM members
      WHERE id::text = $1
      LIMIT 1`,
    [validateId(id)]
  );

  return result.rows[0] || null;
}

async function create(fields) {
  validateFields(fields);

  try {
    return await database.transaction(async (client) => {
      const sequenceResult = await client.query(
        `SELECT nextval('member_account_number_seq') AS account_number`
      );
      const accountNumber =
        `M${String(sequenceResult.rows[0].account_number).padStart(6, '0')}`;

      const result = await client.query(
        `INSERT INTO members
           (acc, first, last, dob, addr, nin, tel, email, photo, created_at, updated_at)
         VALUES
           ($1, $2, $3, $4::date, $5, $6, $7, $8, $9, NOW(), NOW())
         RETURNING ${MEMBER_COLUMNS}`,
        [
          accountNumber,
          fields.first,
          fields.last,
          fields.dob,
          fields.addr,
          fields.nin,
          fields.tel,
          fields.email ?? null,
          fields.photo ?? null
        ]
      );

      return result.rows[0];
    });
  } catch (error) {
    throw mapDatabaseError(error);
  }
}

async function update(id, fields) {
  const memberId = validateId(id);
  validateFields(fields);

  const entries = Object.entries(fields);
  const values = [memberId];
  const assignments = entries.map(([key, value], index) => {
    values.push(value);
    return `${UPDATE_COLUMNS[key]} = $${index + 2}`;
  });

  try {
    const result = await database.query(
      `UPDATE members
          SET ${assignments.join(', ')}, updated_at = NOW()
        WHERE id::text = $1
        RETURNING ${MEMBER_COLUMNS}`,
      values
    );

    return result.rows[0] || null;
  } catch (error) {
    throw mapDatabaseError(error);
  }
}

async function remove(id) {
  const memberId = validateId(id);

  try {
    return await database.transaction(async (client) => {
      const result = await client.query(
        `DELETE FROM members
          WHERE id::text = $1
          RETURNING id`,
        [memberId]
      );

      return result.rowCount > 0;
    });
  } catch (error) {
    throw mapDatabaseError(error);
  }
}

module.exports = {
  list,
  findById,
  create,
  update,
  delete: remove
};