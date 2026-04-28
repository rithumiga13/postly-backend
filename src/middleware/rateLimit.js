import { getRedis } from '../lib/redis.js';
import { env } from '../config/env.js';

/**
 * Redis-backed fixed-window rate limiter.
 *
 * Algorithm:
 *   1. INCR the counter key.
 *   2. On first increment, set EXPIRE so the window resets automatically.
 *   3. If count > max, return 429.
 *   4. Always set X-RateLimit-{Limit,Remaining,Reset} headers.
 *
 * @param {{ windowSeconds: number, max: number, keyBy?: 'ip'|'user', prefix?: string }} opts
 */
export function rateLimit({ windowSeconds, max, keyBy = 'ip', prefix = 'rl' }) {
  return async (req, res, next) => {
    const redis = getRedis();
    const identifier =
      keyBy === 'user' ? (req.user?.id ?? req.ip ?? 'anon') : (req.ip ?? 'unknown');
    const key = `${prefix}:${identifier}`;

    const count = await redis.incr(key);
    if (count === 1) {
      await redis.expire(key, windowSeconds);
    }

    const ttl = await redis.ttl(key);
    const remaining = Math.max(0, max - count);
    const resetAt = Math.floor(Date.now() / 1000) + Math.max(ttl, 0);

    res.setHeader('X-RateLimit-Limit', String(max));
    res.setHeader('X-RateLimit-Remaining', String(remaining));
    res.setHeader('X-RateLimit-Reset', String(resetAt));

    if (count > max) {
      return res.status(429).json({
        data: null,
        meta: {},
        error: {
          code: 'rate_limited',
          message: `Too many requests, try again in ${Math.max(ttl, 0)}s`,
        },
      });
    }

    next();
  };
}

export const defaultRateLimit = rateLimit({
  windowSeconds: Math.floor(env.RATE_LIMIT_WINDOW_MS / 1000),
  max: env.RATE_LIMIT_MAX,
  keyBy: 'ip',
});
