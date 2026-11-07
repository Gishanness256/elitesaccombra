'use strict';

function asyncHandler(handler) {
  if (typeof handler !== 'function') {
    throw new TypeError('asyncHandler expects a function.');
  }

  return function wrappedHandler(req, res, next) {
    try {
      return Promise.resolve(handler.call(this, req, res, next)).catch(next);
    } catch (error) {
      return next(error);
    }
  };
}

module.exports = asyncHandler;