'use strict';

const crypto = require('node:crypto');

const SAFE_CODE = /^[A-Z0-9_]{1,64}$/;

function validStatus(value) {
  return Number.isInteger(value) && value >= 400 && value <= 599;
}

function safeCode(value, fallback) {
  return typeof value === 'string' && SAFE_CODE.test(value)
    ? value
    : fallback;
}

function safeDetails(details) {
  if (Array.isArray(details)) {
    return details.slice(0, 100).map((item) => {
      if (!item || typeof item !== 'object') {
        return { message: 'Invalid value.' };
      }

      return {
        ...(typeof item.field === 'string' ? { field: item.field.slice(0, 200) } : {}),
        message: typeof item.message === 'string'
          ? item.message.slice(0, 500)
          : 'Invalid value.'
      };
    });
  }

  return undefined;
}

function isClientError(error, status) {
  return status >= 400 && status < 500 && error.expose !== false;
}

function logError(error, requestId, req) {
  // Avoid logging request bodies, headers, or other potentially sensitive data.
  const logger = console.error;
  logger({
    requestId,
    method: req.method,
    path: req.originalUrl || req.url,
    error: error.message,
    stack: error.stack
  });
}

function errorHandler(error, req, res, next) {
  if (res.headersSent) {
    return next(error);
  }

  const requestId = req.id || crypto.randomUUID();

  // body-parser reports malformed JSON as a SyntaxError with status 400.
  const isMalformedJson =
    error instanceof SyntaxError &&
    (error.status === 400 || error.statusCode === 400) &&
    Object.prototype.hasOwnProperty.call(error, 'body');

  const status = isMalformedJson
    ? 400
    : validStatus(error.status)
      ? error.status
      : validStatus(error.statusCode)
        ? error.statusCode
        : 500;

  const fallbackCode = status >= 500 ? 'INTERNAL_SERVER_ERROR' : 'REQUEST_ERROR';
  const code = isMalformedJson
    ? 'INVALID_JSON'
    : safeCode(error.code, fallbackCode);

  const clientError = isClientError(error, status);
  const message = isMalformedJson
    ? 'Request body contains invalid JSON.'
    : clientError && typeof error.message === 'string'
      ? error.message
      : 'An unexpected error occurred.';

  if (status >= 500) {
    logError(error, requestId, req);
  }

  // Preserve a valid Retry-After header when supplied by middleware.
  if (error.headers && typeof error.headers['Retry-After'] === 'string') {
    const retryAfter = error.headers['Retry-After'];
    if (/^\d{1,8}$/.test(retryAfter)) {
      res.setHeader('Retry-After', retryAfter);
    }
  }

  const details = clientError ? safeDetails(error.details) : undefined;

  return res.status(status).json({
    error: {
      code,
      message,
      ...(details ? { details } : {}),
      requestId
    }
  });
}

module.exports = errorHandler;