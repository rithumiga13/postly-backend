import pino from 'pino';
import { env } from './env.js';

const isDev = env.NODE_ENV === 'development';

export const logger = pino(
  {
    level: isDev ? 'debug' : 'info',
    // Redact common secret field names wherever they appear in log objects.
    redact: ['password', 'token', 'secret', 'authorization', 'cookie'],
    base: { pid: process.pid },
    timestamp: pino.stdTimeFunctions.isoTime,
  },
  isDev
    ? pino.transport({ target: 'pino-pretty', options: { colorize: true, ignore: 'pid,hostname' } })
    : undefined,
);
