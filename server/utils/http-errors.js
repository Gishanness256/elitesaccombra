'use strict';

class HttpError extends Error {
  constructor(status, code, message, options = {}) {
    super(message, options.cause ? { cause: options.cause } : undefined);

    if (!Number.isInteger(status) || status < 400 || status > 599) {
      throw new TypeError('HTTP error status must be an integer from 400 to 599.');
    }
    if (typeof code !== 'string' || !/^[A-Z0-9_]{1,64}$/.test(code)) {
      throw new TypeError('HTTP error code must contain only uppercase letters, digits, or underscores.');
    }
    if (typeof message !== 'string' || !message.trim()) {
      throw new TypeError('HTTP error message is required.');
    }

    this.name = 'HttpError';
    this.status = status;
    this.statusCode = status;
    this.code = code;
    this.expose = status < 500;

    if (options.details !== undefined) this.details = options.details;
    if (options.headers !== undefined) this.headers = options.headers;

    Error.captureStackTrace?.(this, HttpError);
  }
}

function createHttpError(status, code, message, options) {
  return new HttpError(status, code, message, options);
}

const badRequest = (message = 'Invalid request.', options) =>
  createHttpError(400, 'BAD_REQUEST', message, options);

const unauthorized = (message = 'Authentication is required.', options) =>
  createHttpError(401, 'UNAUTHENTICATED', message, options);

const forbidden = (message = 'You do not have permission to perform this action.', options) =>
  createHttpError(403, 'FORBIDDEN', message, options);

const notFound = (message = 'Resource not found.', options) =>
  createHttpError(404, 'NOT_FOUND', message, options);

const conflict = (message = 'The request conflicts with the current resource state.', options) =>
  createHttpError(409, 'CONFLICT', message, options);

const validationError = (message = 'Request validation failed.', details) =>
  createHttpError(400, 'VALIDATION_ERROR', message, { details });

const tooManyRequests = (message = 'Too many requests. Please try again later.', retryAfterSeconds) => {
  const headers = Number.isInteger(retryAfterSeconds) && retryAfterSeconds > 0
    ? { 'Retry-After': String(retryAfterSeconds) }
    : undefined;

  return createHttpError(429, 'RATE_LIMITED', message, { headers });
};

const internalServerError = (cause) =>
  createHttpError(500, 'INTERNAL_SERVER_ERROR', 'An unexpected error occurred.', {
    cause,
    expose: false
  });

module.exports = {
  HttpError,
  createHttpError,
  badRequest,
  unauthorized,
  forbidden,
  notFound,
  conflict,
  validationError,
  tooManyRequests,
  internalServerError
};