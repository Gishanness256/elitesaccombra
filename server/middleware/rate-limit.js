'use strict';

const DEFAULT_WINDOW_MS = 60_000;
const DEFAULT_LIMIT = 100;
const DEFAULT_MAX_KEYS = 100_000;

function httpError(status, code, message) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function positiveInteger(value, name) {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new TypeError(`${name} must be a positive integer.`);
  }
  return value;
}

function defaultKeyGenerator(req) {
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

function pruneExpired(store, now) {
  for (const [key, entry] of store) {
    if (entry.resetAt <= now) store.delete(key);
  }
}

/**
 * Usage:
 *   app.use('/api', rateLimit());
 *   app.post('/login', rateLimit({ windowMs: 15 * 60_000, limit: 10 }), handler);
 */
function rateLimit(options = {}) {
  const windowMs = positiveInteger(
    options.windowMs ?? DEFAULT_WINDOW_MS,
    'windowMs'
  );
  const limit = positiveInteger(options.limit ?? DEFAULT_LIMIT, 'limit');
  const maxKeys = positiveInteger(
    options.maxKeys ?? DEFAULT_MAX_KEYS,
    'maxKeys'
  );

  const keyGenerator = options.keyGenerator || defaultKeyGenerator;
  const skip = options.skip || (() => false);
  const store = new Map();

  if (typeof keyGenerator !== 'function' || typeof skip !== 'function') {
    throw new TypeError('keyGenerator and skip must be functions.');
  }

  const cleanupInterval = setInterval(
    () => pruneExpired(store, Date.now()),
    Math.min(windowMs, 60_000)
  );
  cleanupInterval.unref?.();

  return function rateLimitMiddleware(req, res, next) {
    try {
      if (skip(req, res)) return next();

      const key = String(keyGenerator(req));
      if (!key || key.length > 512) {
        return next(httpError(400, 'INVALID_RATE_LIMIT_KEY', 'Invalid rate-limit key.'));
      }

      const now = Date.now();
      let entry = store.get(key);

      if (!entry || entry.resetAt <= now) {
        if (store.size >= maxKeys) pruneExpired(store, now);

        // Fail closed rather than silently bypassing limits if the local store
        // is full of active keys. A shared production store is preferable.
        if (store.size >= maxKeys) {
          return next(httpError(
            503,
            'RATE_LIMIT_STORE_FULL',
            'Rate limiting is temporarily unavailable.'
          ));
        }

        entry = { count: 0, resetAt: now + windowMs };
        store.set(key, entry);
      }

      entry.count = Math.min(entry.count + 1, limit + 1);

      const remaining = Math.max(0, limit - entry.count);
      const resetSeconds = Math.max(0, Math.ceil((entry.resetAt - now) / 1000));

      res.setHeader('RateLimit-Policy', `${limit};w=${Math.ceil(windowMs / 1000)}`);
      res.setHeader('RateLimit-Limit', String(limit));
      res.setHeader('RateLimit-Remaining', String(remaining));
      res.setHeader('RateLimit-Reset', String(resetSeconds));

      if (options.legacyHeaders) {
        res.setHeader('X-RateLimit-Limit', String(limit));
        res.setHeader('X-RateLimit-Remaining', String(remaining));
        res.setHeader('X-RateLimit-Reset', String(Math.ceil(entry.resetAt / 1000)));
      }

      req.rateLimit = {
        limit,
        remaining,
        resetAt: new Date(entry.resetAt)
      };

      if (entry.count > limit) {
        res.setHeader('Retry-After', String(resetSeconds));

        if (typeof options.handler === 'function') {
          return options.handler(req, res, next);
        }

        return next(httpError(
          options.statusCode || 429,
          'RATE_LIMITED',
          options.message || 'Too many requests. Please try again later.'
        ));
      }

      return next();
    } catch (error) {
      return next(error);
    }
  };
}

module.exports = rateLimit;