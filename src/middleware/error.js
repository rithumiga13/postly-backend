import { AppError, ValidationError } from '../lib/errors.js';
import { logger } from '../config/logger.js';
import { env } from '../config/env.js';

/**
 * Central error-handling middleware.
 * Must be registered last — Express identifies it by the 4-argument signature.
 *
 * @type {import('express').ErrorRequestHandler}
 */
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, _next) {
  if (err instanceof AppError) {
    if (err.statusCode >= 500) {
      logger.error({ err, req: { method: req.method, url: req.url } }, err.message);
    }

    const body = {
      data: null,
      meta: {},
      error: {
        code: err.code,
        message: err.message,
        ...(err instanceof ValidationError && err.details ? { details: err.details } : {}),
      },
    };

    return res.status(err.statusCode).json(body);
  }

  // Unexpected error — log with full stack but never expose internals.
  logger.error({ err, req: { method: req.method, url: req.url } }, 'Unhandled error');

  return res.status(500).json({
    data: null,
    meta: {},
    error: {
      code: 'INTERNAL_ERROR',
      message: env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
    },
  });
}
