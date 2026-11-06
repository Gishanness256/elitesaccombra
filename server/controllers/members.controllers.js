'use strict';

const membersRepository = require('../repositories/members.repository');

function httpError(status, code, message) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function requiredString(value, field, maxLength) {
  if (typeof value !== 'string') {
    throw httpError(400, 'VALIDATION_ERROR', `${field} is required.`);
  }

  const result = value.trim();
  if (!result || result.length > maxLength) {
    throw httpError(400, 'VALIDATION_ERROR', `${field} must be 1–${maxLength} characters.`);
  }

  return result;
}

function optionalString(value, field, maxLength) {
  if (value == null || value === '') return null;

  if (typeof value !== 'string' || value.trim().length > maxLength) {
    throw httpError(400, 'VALIDATION_ERROR', `${field} must be at most ${maxLength} characters.`);
  }

  return value.trim() || null;
}

function validateDate(value, field) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw httpError(400, 'VALIDATION_ERROR', `${field} must use YYYY-MM-DD format.`);
  }

  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw httpError(400, 'VALIDATION_ERROR', `${field} must be a valid date.`);
  }

  return value;
}

function validateEmail(value) {
  if (value == null || value === '') return null;

  const email = optionalString(value, 'Email', 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw httpError(400, 'VALIDATION_ERROR', 'Email must be valid.');
  }

  return email;
}

function validatePhoto(value) {
  if (value == null || value === '') return null;

  if (typeof value !== 'string' || value.length > 1_500_000) {
    throw httpError(400, 'VALIDATION_ERROR', 'Photo reference is invalid or too large.');
  }

  // Accept a server-managed reference or a small raster data URL.
  // Avoid accepting arbitrary schemes such as javascript: or file:.
  if (/^(https?:\/\/|\/)/i.test(value)) return value;

  if (/^data:image\/(?:jpeg|png|webp);base64,[a-z0-9+/]+=*$/i.test(value)) {
    return value;
  }

  throw httpError(400, 'VALIDATION_ERROR', 'Photo must be an image reference or JPEG, PNG, or WebP data URL.');
}

function validateMember(body, { partial = false } = {}) {
  const fields = {};

  const set = (key, value) => {
    if (!partial || Object.hasOwn(body, key)) fields[key] = value;
  };

  set('first', requiredString(body.first, 'First name', 100));
  set('last', requiredString(body.last, 'Last name', 100));
  set('dob', validateDate(body.dob, 'Date of birth'));
  set('addr', requiredString(body.addr, 'Address', 500));
  set('nin', requiredString(body.nin, 'NIN', 32).toUpperCase());
  set('tel', requiredString(body.tel, 'Telephone', 40));
  set('email', validateEmail(body.email));
  set('photo', validatePhoto(body.photo));

  return fields;
}

function publicMember(member) {
  if (!member) return null;

  // Return only member fields intended for API consumers.
  return {
    id: member.id,
    acc: member.acc,
    first: member.first,
    last: member.last,
    dob: member.dob,
    addr: member.addr,
    nin: member.nin,
    tel: member.tel,
    email: member.email || null,
    photo: member.photo || null,
    createdAt: member.createdAt || member.created_at || null,
    updatedAt: member.updatedAt || member.updated_at || null
  };
}

function requireRepositoryMethod(name) {
  if (typeof membersRepository[name] !== 'function') {
    throw new Error(`members.repository.js must implement ${name}().`);
  }
}

function pagination(query) {
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

function memberId(req) {
  const id = String(req.params.id || '').trim();
  if (!id || id.length > 128) {
    throw httpError(400, 'VALIDATION_ERROR', 'A valid member ID is required.');
  }
  return id;
}

async function listMembers(req, res) {
  requireRepositoryMethod('list');

  const page = pagination(req.query);
  const result = await membersRepository.list(page);
  const members = Array.isArray(result) ? result : result && result.members;

  if (!Array.isArray(members)) {
    throw new Error('members.repository.list() must return an array or { members, total }.');
  }

  res.status(200).json({
    data: {
      members: members.map(publicMember),
      pagination: {
        limit: page.limit,
        offset: page.offset,
        total: Array.isArray(result) ? members.length : Number(result.total) || 0
      }
    }
  });
}

async function getMemberById(req, res) {
  requireRepositoryMethod('findById');

  const member = await membersRepository.findById(memberId(req));
  if (!member) throw httpError(404, 'NOT_FOUND', 'Member not found.');

  res.status(200).json({ data: { member: publicMember(member) } });
}

async function createMember(req, res) {
  requireRepositoryMethod('create');

  const fields = validateMember(req.body || {});
  // The repository should allocate the account number transactionally and
  // enforce uniqueness for NIN, account number, and other relevant fields.
  const member = await membersRepository.create(fields);

  if (!member) throw new Error('members.repository.create() did not return the created member.');

  res.status(201).json({ data: { member: publicMember(member) } });
}

async function updateMember(req, res) {
  requireRepositoryMethod('update');

  const fields = validateMember(req.body || {}, { partial: true });
  if (!Object.keys(fields).length) {
    throw httpError(400, 'VALIDATION_ERROR', 'Provide at least one member field to update.');
  }

  const member = await membersRepository.update(memberId(req), fields);
  if (!member) throw httpError(404, 'NOT_FOUND', 'Member not found.');

  res.status(200).json({ data: { member: publicMember(member) } });
}

async function deleteMember(req, res) {
  requireRepositoryMethod('delete');

  const deleted = await membersRepository.delete(memberId(req));
  if (!deleted) throw httpError(404, 'NOT_FOUND', 'Member not found.');

  res.status(204).end();
}

module.exports = {
  listMembers,
  getMemberById,
  createMember,
  updateMember,
  deleteMember
};
