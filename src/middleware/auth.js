import { verifyAccess } from '../lib/jwt.js';
import { AuthError } from '../lib/errors.js';

/**
 * Verifies the Bearer access token in the Authorization header.
 * Attaches the decoded payload to req.user on success.
 *
 * @type {import('express').RequestHandler}
 */
export function requireAuth(req, _res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return next(new AuthError('Missing or malformed Authorization header'));
  }
  const token = header.slice(7);
  try {
    req.user = verifyAccess(token);
    return next();
  } catch (err) {
    return next(err);
  }
}
