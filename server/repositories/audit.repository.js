'use strict';

const database = require('../config/database');

const AUDIT_COLUMNS = `
  id,
  actor_id AS "actorId",
  actor_name AS "actorName",
  actor_role AS "actorRole",
  action,
  entity_type AS "entityType",
  entity_id AS "entityId",
  details,
  ip_address AS "ipAddress",
  user_agent AS "userAgent",
  created_at AS "createdAt"
`;

function validatePagination({ limit = 50, offset = 0 } = {}) {
  const pageLimit = Number(limit);
  const pageOffset = Number(offset);

  if (!Number.isInteger(pageLimit) || pageLimit < 1 || pageLimit > 100) {
    throw new TypeError('limit must be an integer from 1 to 100.');
  }
  if (!Number.isInteger(pageOffset) || pageOffset < 0) {
    throw new TypeError('offset must be a non-negative integer.');
  }

  return { limit: pageLimit, offset: pageOffset };
}

function optionalText(value, field, maxLength) {
  if (value == null || value === '') return null;
  if (typeof value !== 'string' || value.trim().length > maxLength) {
    throw new TypeError(`${field} must be a string of at most ${maxLength} characters.`);
  }
  return value.trim() || null;
}

function validDate(value, field) {
  if (value == null || value === '') return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new TypeError(`${field} must use YYYY-MM-DD format.`);
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new TypeError(`${field} must be a valid calendar date.`);
  }

  return value;
}

function escapeLike(value) {
  return value.replace(/[\\%_]/g, '\\$&');
}

function getQueryable(client) {
  return client || database;
}

/**
 * Append one audit entry. Pass a transaction client when the event must be
 * committed or rolled back together with the business operation.
 */
async function insertEntry(entry, { client } = {}) {
  const queryable = getQueryable(client);
  const actorId = entry && entry.actorId;

  if (actorId == null) {
    throw new TypeError('actorId is required.');
  }

  const action = optionalText(entry.action, 'action', 120);
  if (!action) throw new TypeError('action is required.');

  const details = entry.details == null
    ? null
    : JSON.stringify(entry.details);

  const result = await queryable.query(
    `INSERT INTO audit_logs
       (actor_id, actor_name, actor_role, action, entity_type, entity_id,
        details, ip_address, user_agent, created_at)
     VALUES
       ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, NOW())
     RETURNING ${AUDIT_COLUMNS}`,
    [
      String(actorId),
      optionalText(entry.actorName, 'actorName', 160),
      optionalText(entry.actorRole, 'actorRole', 80),
      action,
      optionalText(entry.entityType, 'entityType', 100),
      entry.entityId == null
        ? null
        : optionalText(String(entry.entityId), 'entityId', 128),
      details,
      optionalText(entry.ipAddress, 'ipAddress', 64),
      optionalText(entry.userAgent, 'userAgent', 500)
    ]
  );

  return result.rows[0] || null;
}

/**
 * Filters: userId, activity, from, to, and search.
 * Authorization should be enforced by the service/controller before calling.
 */
async function listEntries({
  limit = 50,
  offset = 0,
  userId,
  activity,
  from,
  to,
  search
} = {}) {
  const page = validatePagination({ limit, offset });
  const filters = {
    userId: optionalText(userId, 'userId', 128),
    activity: optionalText(activity, 'activity', 120),
    from: validDate(from, 'from'),
    to: validDate(to, 'to'),
    search: optionalText(search, 'search', 200)
  };

  if (filters.from && filters.to && filters.from > filters.to) {
    throw new TypeError('from must not be later than to.');
  }

  const conditions = [];
  const values = [];

  if (filters.userId) {
    values.push(filters.userId);
    conditions.push(`actor_id::text = $${values.length}`);
  }
  if (filters.activity) {
    values.push(filters.activity);
    conditions.push(`action ILIKE $${values.length}`);
  }
  if (filters.from) {
    values.push(filters.from);
    conditions.push(`created_at >= $${values.length}::date`);
  }
  if (filters.to) {
    values.push(filters.to);
    conditions.push(`created_at < ($${values.length}::date + INTERVAL '1 day')`);
  }
  if (filters.search) {
    values.push(`%${escapeLike(filters.search)}%`);
    const parameter = `$${values.length}`;
    conditions.push(`(
      actor_name ILIKE ${parameter} ESCAPE E'\\\\'
      OR action ILIKE ${parameter} ESCAPE E'\\\\'
      OR entity_type ILIKE ${parameter} ESCAPE E'\\\\'
      OR entity_id ILIKE ${parameter} ESCAPE E'\\\\'
    )`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const countValues = [...values];
  const queryValues = [...values, page.limit, page.offset];

  const [rowsResult, countResult] = await Promise.all([
    database.query(
      `SELECT ${AUDIT_COLUMNS}
         FROM audit_logs
         ${where}
        ORDER BY created_at DESC, id DESC
        LIMIT $${queryValues.length - 1} OFFSET $${queryValues.length}`,
      queryValues
    ),
    database.query(
      `SELECT COUNT(*)::int AS total
         FROM audit_logs
         ${where}`,
      countValues
    )
  ]);

  return {
    entries: rowsResult.rows,
    total: countResult.rows[0].total,
    pagination: page
  };
}

async function findEntryById(id, { client } = {}) {
  const entryId = String(id ?? '').trim();
  if (!entryId || entryId.length > 128) {
    throw new TypeError('A valid audit entry ID is required.');
  }

  const result = await getQueryable(client).query(
    `SELECT ${AUDIT_COLUMNS}
       FROM audit_logs
      WHERE id::text = $1
      LIMIT 1`,
    [entryId]
  );

  return result.rows[0] || null;
}

function withTransaction(callback) {
  if (typeof database.transaction !== 'function') {
    throw new Error('database must implement transaction(callback).');
  }
  return database.transaction(callback);
}

module.exports = {
  insertEntry,
  listEntries,
  findEntryById,
  withTransaction
};