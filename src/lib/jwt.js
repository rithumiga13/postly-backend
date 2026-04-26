import jwt from 'jsonwebtoken';
import { randomBytes, createHash } from 'crypto';
import { env } from '../config/env.js';
import { AuthError } from './errors.js';

const ACCESS_TOKEN_EXPIRY = '15m';
const REFRESH_TOKEN_BYTES = 64;
const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * Signs a short-lived access token for the given user.
 *
 * @param {{ id: string, email: string }} user
 * @returns {string}
 */
export function signAccess(user) {
  return jwt.sign(
    { sub: user.id, type: 'access', email: user.email },
    env.JWT_SECRET,
    { expiresIn: ACCESS_TOKEN_EXPIRY },
  );
}

/**
 * Verifies an access token and returns its payload.
 *
 * @param {string} token
 * @returns {object} decoded payload
 * @throws {AuthError}
 */
export function verifyAccess(token) {
  try {
    const payload = jwt.verify(token, env.JWT_SECRET);
    if (payload.type !== 'access') {
      throw new AuthError('Invalid token type');
    }
    return payload;
  } catch (err) {
    if (err instanceof AuthError) throw err;
    throw new AuthError(err.message);
  }
}

/**
 * Mints a new opaque refresh token.
 * Returns the raw token (sent to the client) and its sha256 hash (stored in DB).
 *
 * @returns {{ raw: string, hash: string, expiresAt: Date }}
 */
export function mintRefreshRaw() {
  const raw = randomBytes(REFRESH_TOKEN_BYTES).toString('hex');
  const hash = createHash('sha256').update(raw).digest('hex');
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);
  return { raw, hash, expiresAt };
}
