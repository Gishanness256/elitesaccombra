'use strict';

const loansService = require('../services/loans.service');

function httpError(status, code, message) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function requireServiceMethod(name) {
  if (typeof loansService[name] !== 'function') {
    throw new Error(`loans.service.js must implement ${name}().`);
  }
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

function positiveAmount(value, field) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 1_000_000_000_000) {
    throw httpError(400, 'VALIDATION_ERROR', `${field} must be a positive number.`);
  }
  return amount;
}

function validDate(value, field) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw httpError(400, 'VALIDATION_ERROR', `${field} must use YYYY-MM-DD format.`);
  }

  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw httpError(400, 'VALIDATION_ERROR', `${field} must be a valid calendar date.`);
  }

  return value;
}

function requireId(value, field) {
  const id = String(value || '').trim();
  if (!id || id.length > 128) {
    throw httpError(400, 'VALIDATION_ERROR', `${field} is required.`);
  }
  return id;
}

function validatePagination(query) {
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

function publicLoan(loan) {
  if (!loan) return null;

  return {
    id: loan.id,
    ref: loan.ref,
    requestId: loan.requestId || loan.req || null,
    accountId: loan.accountId || loan.acc || null,
    borrowerName: loan.borrowerName || loan.name || null,
    telephone: loan.telephone || loan.tel || null,
    category: loan.category || loan.cat || null,
    termMonths: loan.termMonths ?? loan.term ?? null,
    principal: Number(loan.principal ?? loan.amt) || 0,
    monthlyRate: Number(loan.monthlyRate ?? loan.rate) || 0,
    disbursedAt: loan.disbursedAt || loan.date || null,
    status: loan.status || null,
    repayments: Array.isArray(loan.repayments || loan.reps)
      ? (loan.repayments || loan.reps).map(publicRepayment)
      : undefined,
    createdAt: loan.createdAt || loan.created_at || null,
    updatedAt: loan.updatedAt || loan.updated_at || null
  };
}

function publicRequest(request) {
  if (!request) return null;

  return {
    id: request.id,
    ref: request.ref || request.id,
    accountId: request.accountId || request.acc || null,
    applicantType: request.applicantType || (request.type === 'm' ? 'member' : 'non-member'),
    applicantName: request.applicantName || request.name || null,
    telephone: request.telephone || request.tel || null,
    category: request.category || request.cat || null,
    termMonths: request.termMonths ?? request.term ?? null,
    amount: Number(request.amount ?? request.amt) || 0,
    monthlyRate: Number(request.monthlyRate ?? request.rate) || 0,
    date: request.date || null,
    status: request.status || null,
    remark: request.remark || null,
    requestedBy: request.requestedBy || request.by || null,
    decidedBy: request.decidedBy || request.decBy || null,
    decidedAt: request.decidedAt || request.decOn || null,
    createdAt: request.createdAt || request.created_at || null
  };
}

function publicRepayment(repayment) {
  if (!repayment) return null;

  return {
    id: repayment.id,
    date: repayment.date,
    amount: Number(repayment.amount ?? repayment.amt) || 0,
    principalPaid: Number(repayment.principalPaid ?? repayment.p) || 0,
    interestPaid: Number(repayment.interestPaid ?? repayment.i) || 0,
    balanceAfter: Number(repayment.balanceAfter ?? repayment.bal) || 0,
    type: repayment.type || null,
    recordedBy: repayment.recordedBy || repayment.ini || null,
    createdAt: repayment.createdAt || repayment.created_at || null
  };
}

function validateRequestBody(body) {
  const applicantType = body.applicantType || body.type;
  const isMember = applicantType === 'member' || applicantType === 'm';
  const isNonMember = applicantType === 'non-member' || applicantType === 'n';

  if (!isMember && !isNonMember) {
    throw httpError(400, 'VALIDATION_ERROR', 'Applicant type must be member or non-member.');
  }

  const accountId = isMember
    ? requiredString(body.accountId || body.acc, 'Member account', 64)
    : null;

  const applicantName = requiredString(
    body.applicantName || body.name,
    'Applicant name',
    200
  );

  const telephone = requiredString(body.telephone || body.tel, 'Telephone', 40);
  const category = requiredString(body.category || body.cat, 'Loan category', 100);
  const termMonths = Number(body.termMonths ?? body.term);

  if (!Number.isInteger(termMonths) || termMonths < 1 || termMonths > 60) {
    throw httpError(400, 'VALIDATION_ERROR', 'Loan term must be an integer from 1 to 60 months.');
  }

  const monthlyRate = Number(body.monthlyRate ?? body.rate);
  if (!Number.isFinite(monthlyRate) || monthlyRate <= 0 || monthlyRate > 30) {
    throw httpError(400, 'VALIDATION_ERROR', 'Monthly interest rate must be greater than 0 and no more than 30%.');
  }

  return {
    applicantType: isMember ? 'member' : 'non-member',
    accountId,
    applicantName,
    telephone,
    email: optionalString(body.email, 'Email', 254),
    address: optionalString(body.address || body.addr, 'Address', 500),
    nin: isNonMember ? optionalString(body.nin, 'NIN', 32) : null,
    category,
    termMonths,
    amount: positiveAmount(body.amount ?? body.amt, 'Loan amount'),
    monthlyRate,
    date: validDate(body.date, 'Request date')
  };
}

function publicDecision(status, remark) {
  const allowed = new Set(['Approved', 'Rejected', 'On Hold']);
  if (!allowed.has(status)) {
    throw httpError(400, 'VALIDATION_ERROR', 'Decision must be Approved, Rejected, or On Hold.');
  }

  const cleanRemark = optionalString(remark, 'Remark', 2000);
  if (status !== 'Approved' && !cleanRemark) {
    throw httpError(400, 'VALIDATION_ERROR', 'A remark is required when holding or rejecting a request.');
  }

  return { status, remark: cleanRemark };
}

async function listRequests(req, res) {
  requireServiceMethod('listRequests');

  const page = validatePagination(req.query);
  const result = await loansService.listRequests({
    ...page,
    status: optionalString(req.query.status, 'Status', 30),
    user: req.user
  });

  const requests = Array.isArray(result) ? result : result && result.requests;
  if (!Array.isArray(requests)) {
    throw new Error('loans.service.listRequests() must return an array or { requests, total }.');
  }

  res.status(200).json({
    data: {
      requests: requests.map(publicRequest),
      pagination: {
        ...page,
        total: Array.isArray(result) ? requests.length : Number(result.total) || 0
      }
    }
  });
}

async function createRequest(req, res) {
  requireServiceMethod('createRequest');

  const request = await loansService.createRequest({
    ...validateRequestBody(req.body || {}),
    user: req.user
  });

  if (!request) throw new Error('loans.service.createRequest() did not return the created request.');

  res.status(201).json({ data: { request: publicRequest(request) } });
}

async function getRequest(req, res) {
  requireServiceMethod('getRequest');

  const request = await loansService.getRequest({
    requestId: requireId(req.params.requestId, 'Request ID'),
    user: req.user
  });

  if (!request) throw httpError(404, 'NOT_FOUND', 'Loan request not found.');

  res.status(200).json({ data: { request: publicRequest(request) } });
}

async function decideRequest(req, res) {
  requireServiceMethod('decideRequest');

  const decision = publicDecision(
    req.body && req.body.status,
    req.body && req.body.remark
  );

  const request = await loansService.decideRequest({
    requestId: requireId(req.params.requestId, 'Request ID'),
    ...decision,
    user: req.user
  });

  if (!request) throw httpError(404, 'NOT_FOUND', 'Loan request not found.');

  res.status(200).json({ data: { request: publicRequest(request) } });
}

async function listLoans(req, res) {
  requireServiceMethod('listLoans');

  const page = validatePagination(req.query);
  const result = await loansService.listLoans({
    ...page,
    status: optionalString(req.query.status, 'Status', 30),
    accountId: optionalString(req.query.accountId, 'Account ID', 64),
    user: req.user
  });

  const loans = Array.isArray(result) ? result : result && result.loans;
  if (!Array.isArray(loans)) {
    throw new Error('loans.service.listLoans() must return an array or { loans, total }.');
  }

  res.status(200).json({
    data: {
      loans: loans.map(publicLoan),
      pagination: {
        ...page,
        total: Array.isArray(result) ? loans.length : Number(result.total) || 0
      }
    }
  });
}

async function getLoan(req, res) {
  requireServiceMethod('getLoan');

  const loan = await loansService.getLoan({
    loanId: requireId(req.params.loanId, 'Loan ID'),
    user: req.user
  });

  if (!loan) throw httpError(404, 'NOT_FOUND', 'Loan not found.');

  res.status(200).json({ data: { loan: publicLoan(loan) } });
}

async function listRepayments(req, res) {
  requireServiceMethod('listRepayments');

  const page = validatePagination(req.query);
  const result = await loansService.listRepayments({
    loanId: requireId(req.params.loanId, 'Loan ID'),
    ...page,
    user: req.user
  });

  const repayments = Array.isArray(result) ? result : result && result.repayments;
  if (!Array.isArray(repayments)) {
    throw new Error('loans.service.listRepayments() must return an array or { repayments, total }.');
  }

  res.status(200).json({
    data: {
      repayments: repayments.map(publicRepayment),
      pagination: {
        ...page,
        total: Array.isArray(result) ? repayments.length : Number(result.total) || 0
      }
    }
  });
}

async function createRepayment(req, res) {
  requireServiceMethod('createRepayment');

  const body = req.body || {};
  const date = validDate(body.date, 'Payment date');
  const amount = positiveAmount(body.amount ?? body.amt, 'Payment amount');
  const type = optionalString(body.type, 'Payment type', 80) || 'Installment';

  const result = await loansService.createRepayment({
    loanId: requireId(req.params.loanId, 'Loan ID'),
    date,
    amount,
    type,
    user: req.user
  });

  if (!result || !result.repayment) {
    throw new Error('loans.service.createRepayment() must return { repayment, loan }.');
  }

  res.status(201).json({
    data: {
      repayment: publicRepayment(result.repayment),
      loan: result.loan ? publicLoan(result.loan) : undefined
    }
  });
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