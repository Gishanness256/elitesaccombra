'use strict';

function httpError(status, code, message, details) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  if (details) error.details = details;
  return error;
}

function formatIssues(issues) {
  if (!Array.isArray(issues)) return undefined;

  return issues.map((issue) => ({
    field: Array.isArray(issue.path)
      ? issue.path.join('.')
      : issue.field || issue.path || '',
    message: issue.message || 'Invalid value.'
  }));
}

async function parseWith(schema, value, target) {
  if (typeof schema === 'function') {
    return schema(value);
  }

  if (schema && typeof schema.safeParseAsync === 'function') {
    const result = await schema.safeParseAsync(value);
    if (!result.success) {
      throw httpError(
        400,
        'VALIDATION_ERROR',
        `Invalid ${target}.`,
        formatIssues(result.error && result.error.issues)
      );
    }
    return result.data;
  }

  if (schema && typeof schema.safeParse === 'function') {
    const result = schema.safeParse(value);
    if (!result.success) {
      throw httpError(
        400,
        'VALIDATION_ERROR',
        `Invalid ${target}.`,
        formatIssues(result.error && result.error.issues)
      );
    }
    return result.data;
  }

  if (schema && typeof schema.validateAsync === 'function') {
    try {
      return await schema.validateAsync(value, {
        abortEarly: false,
        stripUnknown: true
      });
    } catch (error) {
      throw httpError(
        400,
        'VALIDATION_ERROR',
        `Invalid ${target}.`,
        formatIssues(error.details)
      );
    }
  }

  if (schema && typeof schema.validate === 'function') {
    const result = schema.validate(value, {
      abortEarly: false,
      stripUnknown: true
    });

    if (result.error) {
      throw httpError(
        400,
        'VALIDATION_ERROR',
        `Invalid ${target}.`,
        formatIssues(result.error.details)
      );
    }
    return result.value;
  }

  if (schema && typeof schema.parseAsync === 'function') {
    return schema.parseAsync(value);
  }

  if (schema && typeof schema.parse === 'function') {
    return schema.parse(value);
  }

  throw new TypeError(
    `Validation schema for "${target}" must provide parse(), safeParse(), validate(), or be a function.`
  );
}

/**
 * Usage:
 *   router.post('/', validate({ body: createSchema }), handler);
 *
 * Supported schema targets: body, params, query.
 * The parsed results are set on req.validated[target].
 */
function validate(schemas = {}) {
  if (!schemas || typeof schemas !== 'object' || Array.isArray(schemas)) {
    throw new TypeError('validate() expects an object of request schemas.');
  }

  const allowedTargets = new Set(['body', 'params', 'query']);
  for (const target of Object.keys(schemas)) {
    if (!allowedTargets.has(target)) {
      throw new TypeError(`Unsupported validation target: ${target}.`);
    }
  }

  return async function validateRequest(req, res, next) {
    try {
      const validated = {};

      for (const target of ['params', 'query', 'body']) {
        if (schemas[target]) {
          validated[target] = await parseWith(
            schemas[target],
            req[target] || {},
            target
          );
        }
      }

      req.validated = {
        ...(req.validated || {}),
        ...validated
      };

      return next();
    } catch (error) {
      if (error && error.status === 400 && error.code === 'VALIDATION_ERROR') {
        return next(error);
      }

      // Zod parse() errors and other schema-library errors are treated as
      // invalid client input, while unexpected errors continue to the handler.
      if (error && Array.isArray(error.issues)) {
        return next(httpError(
          400,
          'VALIDATION_ERROR',
          'Request validation failed.',
          formatIssues(error.issues)
        ));
      }

      return next(error);
    }
  };
}

module.exports = validate;