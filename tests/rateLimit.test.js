/**
 * Tests for the Redis-backed rateLimit factory.
 * Calls the middleware directly (no HTTP layer) to keep the test tight.
 */

import { jest } from '@jest/globals';

// Prevent bot + worker startup
jest.unstable_mockModule('../src/modules/telegram/bot.js', () => ({
  initBot: jest.fn().mockReturnValue(null),
  getBot: jest.fn().mockReturnValue(null),
}));
jest.unstable_mockModule('../src/worker.js', () => ({
  startWorkers: jest.fn(),
}));

const { rateLimit } = await import('../src/middleware/rateLimit.js');
const { getRedis } = await import('../src/lib/redis.js');

describe('rateLimit factory', () => {
  const prefix = `rl-test-${Date.now()}`;
  const ip = '192.0.2.1';

  afterAll(async () => {
    const redis = getRedis();
    const keys = await redis.keys(`${prefix}:*`);
    if (keys.length) await redis.del(...keys);
  });

  it('allows requests up to max and rejects the next with 429 + rate_limited code', async () => {
    const limiter = rateLimit({ windowSeconds: 60, max: 2, prefix });
    const makeReq = () => ({ ip, user: null });

    const results = [];

    for (let i = 0; i < 3; i++) {
      let statusCode = null;
      let responseBody = null;
      let nextCalled = false;

      const res = {
        setHeader: jest.fn(),
        status(code) {
          statusCode = code;
          return { json: (body) => { responseBody = body; } };
        },
      };

      await limiter(makeReq(), res, () => { nextCalled = true; });
      results.push({ statusCode, responseBody, nextCalled });
    }

    // Requests 1 and 2 pass through
    expect(results[0].nextCalled).toBe(true);
    expect(results[0].statusCode).toBeNull();

    expect(results[1].nextCalled).toBe(true);
    expect(results[1].statusCode).toBeNull();

    // Request 3 is rate-limited
    expect(results[2].nextCalled).toBe(false);
    expect(results[2].statusCode).toBe(429);
    expect(results[2].responseBody.error.code).toBe('rate_limited');
  });
});
