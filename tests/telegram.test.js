/**
 * Phase 5 tests:
 *  1. Redis session adapter round-trip (set/get/delete)
 *  2. /post command replies with link instructions when no telegramChatId is linked
 */

import { jest } from '@jest/globals';

// ── Mocks (must precede dynamic imports) ──────────────────────────────────────

// Prevent worker startup
jest.unstable_mockModule('../src/worker.js', () => ({
  startWorkers: jest.fn(),
}));

// Prevent bot from connecting to Telegram in tests
jest.unstable_mockModule('../src/modules/telegram/bot.js', () => ({
  initBot: jest.fn().mockReturnValue(null),
  getBot: jest.fn().mockReturnValue(null),
}));

// ── Dynamic imports ────────────────────────────────────────────────────────────

const { buildSessionStorage } = await import('../src/modules/telegram/session.js');
const { getRedis } = await import('../src/lib/redis.js');

// ── Test 1: Redis session adapter round-trip ───────────────────────────────────

describe('buildSessionStorage', () => {
  const storage = buildSessionStorage();
  const key = `test-session-${Date.now()}`;

  afterAll(async () => {
    const redis = getRedis();
    await redis.del(`tg:session:${key}`);
  });

  it('returns undefined for a missing key', async () => {
    const val = await storage.read(key);
    expect(val).toBeUndefined();
  });

  it('writes and reads back a session object', async () => {
    const data = { __conversations: { publishFlow: { step: 2 } } };
    await storage.write(key, data);
    const readBack = await storage.read(key);
    expect(readBack).toEqual(data);
  });

  it('deletes a key', async () => {
    await storage.delete(key);
    const val = await storage.read(key);
    expect(val).toBeUndefined();
  });

  it('sets a TTL (key expires)', async () => {
    await storage.write(key, { x: 1 });
    const redis = getRedis();
    const ttl = await redis.ttl(`tg:session:${key}`);
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(1800);
    await storage.delete(key);
  });
});

// ── Test 2: /post without linked account → link instructions ──────────────────

describe('publishFlow — unlinked user', () => {
  it('replies with link instructions when telegramChatId not set', async () => {
    // Build a minimal mock grammy conversation + ctx
    const replies = [];

    const mockCtx = {
      from: { id: 99999999 },
      chat: { id: 99999999 },
      reply: jest.fn(async (text) => { replies.push(text); return {}; }),
      api: { editMessageReplyMarkup: jest.fn() },
    };

    // conversation.external executes the callback immediately (no replay in unit test)
    const mockConversation = {
      external: jest.fn(async (fn) => fn()),
      wait: jest.fn(),
    };

    // Import the flow directly and call it
    const { publishFlow } = await import('../src/modules/telegram/flows/publish.js');
    await publishFlow(mockConversation, mockCtx);

    // Should have replied once with link instructions
    expect(mockCtx.reply).toHaveBeenCalledTimes(1);
    expect(replies[0]).toMatch(/link/i);
    expect(replies[0]).toMatch(/\/link/i);

    // Should NOT have called conversation.wait() — conversation ends immediately
    expect(mockConversation.wait).not.toHaveBeenCalled();
  });
});
