import { getRedis } from '../../lib/redis.js';

const SESSION_TTL = 1800;
const KEY_PREFIX = 'tg:session:';

export function buildSessionStorage() {
  return {
    async read(key) {
      const redis = getRedis();
      const raw = await redis.get(`${KEY_PREFIX}${key}`);
      if (raw == null) return undefined;
      try {
        return JSON.parse(raw);
      } catch {
        return undefined;
      }
    },
    async write(key, value) {
      const redis = getRedis();
      await redis.set(`${KEY_PREFIX}${key}`, JSON.stringify(value), 'EX', SESSION_TTL);
    },
    async delete(key) {
      const redis = getRedis();
      await redis.del(`${KEY_PREFIX}${key}`);
    },
  };
}
