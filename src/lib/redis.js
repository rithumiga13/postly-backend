import Redis from 'ioredis';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';

// Single shared client — ioredis handles reconnection automatically.
let client;

export function getRedis() {
  if (!client) {
    client = new Redis(env.REDIS_URL, {
      // Do not crash the process on connection failure; let the health check surface it.
      lazyConnect: true,
      maxRetriesPerRequest: null,
    });

    client.on('connect', () => logger.info('Redis connected'));
    client.on('error', (err) => logger.error({ err }, 'Redis error'));
    client.on('reconnecting', () => logger.warn('Redis reconnecting'));
  }
  return client;
}

/**
 * Ping Redis and return true if reachable.
 * @returns {Promise<boolean>}
 */
export async function redisOk() {
  try {
    const reply = await getRedis().ping();
    return reply === 'PONG';
  } catch {
    return false;
  }
}
