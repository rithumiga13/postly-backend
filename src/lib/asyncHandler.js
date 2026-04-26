/**
 * Wraps an async Express route handler so that rejected promises are forwarded
 * to next(err) instead of becoming unhandled rejections.
 *
 * Express 4 does not catch async errors automatically; Express 5 does.
 *
 * @param {import('express').RequestHandler} fn
 * @returns {import('express').RequestHandler}
 */
export const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);
