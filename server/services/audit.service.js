'use strict';

const database = require('../config/database');

const AUDIT_ROLES = new Set(['Admin', 'Treasurer']);
const MAX_LIMIT = 100;
const MAX_SEARCH_LENGTH = 200;
const MAX_DETAILS_LENGTH = 10_000;
const SENSITIVE_KEY = /password|secret|token|authorization|cookie|credential/i;

function httpError(status, code, message) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function requireAuditAccess(user) {
  if (!user || user.id == null || !AUDIT_ROLES.has(user.role)) {
    throw httpError(403, 'FORBIDDEN', 'You do not have permission to access the audit log.');
  }
}

function pagination({ limit = 50, offset = 0 } = {}) {
  const parsedLimit = Number(limit);
  const parsedOffset = Number(offset);

  if (!Number.isInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > MAX_LIMIT) {
    throw httpError(400, 'VALIDATION_ERROR', `limit must be an integer from 1 to ${MAX_LIMIT}.`);
  }
  if (!Number.isInteger(parsedOffset) || parsedOffset < 0) {
    throw httpError(400, 'VALIDATION_ERROR', 'offset must be a non-negative integer.');
  }

  return { limit: parsedLimit, offset: parsedOffset };
}

function optionalText(value, field, maxLength) {
  if (value == null || value === '') return null;
  if (typeof value !== 'string' || value.trim().length > maxLength) {
    throw httpError(400, 'VALIDATION_ERROR', `${field} must be at most ${maxLength} characters.`);
  }
  return value.trim() || null;
}

function validDate(value, field) {
  if (value == null || value === '') return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw httpError(400, 'VALIDATION_ERROR', `${field} must use YYYY-MM-DD format.`);
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw httpError(400, 'VALIDATION_ERROR', `${field} must be a valid calendar date.`);
  }
  return value;
}

function scrubDetails(value, depth = 0) {
  if (depth > 6) return '[truncated]';
  if (value == null || typeof value === 'boolean' || typeof value === 'number') return value;
  if (typeof value === 'string') return value.slice(0, 2_000);
  if (Array.isArray(value)) return value.slice(0, 50).map((item) => scrubDetails(item, depth + 1));

  if (typeof value === 'object') {
    const safe = {};
    for (const [key, item] of Object.entries(value).slice(0, 100)) {
      if (!SENSITIVE_KEY.test(key)) safe[key] = scrubDetails(item, depth + 1);
    }
    return safe;
  }

  return String(value).slice(0, 500);
}

function normalizeDetails(details) {
  if (details == null) return null;

  let safe;
  try {
    safe = scrubDetails(details);
  } catch {
    throw httpError(400, 'VALIDATION_ERROR', 'Audit details must be serializable.');
  }

  const serialized = JSON.stringify(safe);
  if (serialized.length > MAX_DETAILS_LENGTH) {
    throw httpError(400, 'VALIDATION_ERROR', 'Audit details are too large.');
  }
  return safe;
}

function mapAuditRow(row) {
  return {
    id: row.id,
    userId: row.actorId,
    userName: row.actorName,
    role: row.actorRole,
    activity: row.action,
    entityType: row.entityType,
    entityId: row.entityId,
    details: row.details,
    ipAddress: row.ipAddress,
    createdAt: row.createdAt
  };
}

/**
 * Write an audit event using an existing transaction client when provided.
 * Keep audit rows append-only: do not expose update or delete operations.
 */
async function recordEvent(event, { client } = {}) {
  const actor = event && event.user;
  if (!actor || actor.id == null) {
    throw httpError(401, 'UNAUTHENTICATED', 'An authenticated user is required to record an audit event.');
  }

  const action = optionalText(event.action, 'action', 120);
  if (!action) {
    throw httpError(400, 'VALIDATION_ERROR', 'Audit action is required.');
  }

  const entityType = optionalText(event.entityType, 'entityType', 100);
  const entityId = event.entityId == null
    ? null
    : optionalText(String(event.entityId), 'entityId', 128);

  const details = normalizeDetails(event.details);
  const ipAddress = optionalText(event.ipAddress, 'ipAddress', 64);
  const userAgent = optionalText(event.userAgent, 'userAgent', 500);
  const queryable = client || database;

  const result = await queryable.query(
    `INSERT INTO audit_logs
       (actor_id, actor_name, actor_role, action, entity_type, entity_id,
        details, ip_address, user_agent, created_at)
     VALUES
       ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, NOW())
     RETURNING id,
               actor_id AS "actorId",
               actor_name AS "actorName",
               actor_role AS "actorRole",
               action,
               entity_type AS "entityType",
               entity_id AS "entityId",
               details,
               ip_address AS "ipAddress",
               created_at AS "createdAt"`,
    [
      String(actor.id),
      optionalText(actor.name, 'actor name', 160),
      optionalText(actor.role, 'actor role', 80),
      action,
      entityType,
      entityId,
      details == null ? null : JSON.stringify(details),
      ipAddress,
      userAgent
    ]
  );

  return mapAuditRow(result.rows[0]);
}

/**
 * Run a business operation and insert its audit event in the same transaction.
 * eventFactory receives the operation result and must return recordEvent fields.
 */
async function withAuditTransaction(operation, eventFactory) {
  if (typeof operation !== 'function' || typeof eventFactory !== 'function') {
    throw new TypeError('operation and eventFactory must be functions.');
  }

  return database.transaction(async (client) => {
    const result = await operation(client);
    const event = await eventFactory(result);
    await recordEvent(event, { client });
    return result;
  });
}

/**
 * Filters accepted: user/userId, activity, from, to, and search.
 * Search is limited to indexed/approved text fields and uses bound parameters.
 */
async function listEntries({
  limit = 50,
  offset = 0,
  user,
  userId,
  activity,
  from,
  to,
  search
} = {}) {
  requireAuditAccess(user);

  const page = pagination({ limit, offset });
  const filters = {
    userId: optionalText(userId, 'userId', 128),
    activity: optionalText(activity, 'activity', 120),
    from: validDate(from, 'from'),
    to: validDate(to, 'to'),
    search: optionalText(search, 'search', MAX_SEARCH_LENGTH)
  };

  if (filters.from && filters.to && filters.from > filters.to) {
    throw httpError(400, 'VALIDATION_ERROR', 'from must not be later than to.');
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
    values.push(`%${filters.search.replace(/[\\%_]/g, '\\$&')}%`);
    const p = `$${values.length}`;
    conditions.push(`(
      actor_name ILIKE ${p} ESCAPE '\\'
      OR action ILIKE ${p} ESCAPE '\\'
      OR entity_type ILIKE ${p} ESCAPE '\\'
      OR entity_id ILIKE ${p} ESCAPE '\\'
    )`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const countValues = [...values];
  const queryValues = [...values, page.limit, page.offset];

  const [rows, count] = await Promise.all([
    database.query(
      `SELECT id,
              actor_id AS "actorId",
              actor_name AS "actorName",
              actor_role AS "actorRole",
              action,
              entity_type AS "entityType",
              entity_id AS "entityId",
              details,
              ip_address AS "ipAddress",
              created_at AS "createdAt"
         FROM audit_logs
         ${where}
        ORDER BY created_at DESC, id DESC
        LIMIT $${queryValues.length - 1} OFFSET $${queryValues.length}`,
      queryValues
    ),
    database.query(
      `SELECT COUNT(*)::int AS total FROM audit_logs ${where}`,
      countValues
    )
  ]);

  return {
    entries: rows.rows.map(mapAuditRow),
    total: count.rows[0].total,
    pagination: page
  };
}

module.exports = {
  listEntries,
  recordEvent,
  withAuditTransaction
};