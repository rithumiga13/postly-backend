import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { selfTest } from './lib/crypto.js';
import { getRedis } from './lib/redis.js';
import app from './app.js';

if (env.NODE_ENV === 'development') {
  selfTest();
  logger.debug('Crypto self-test passed');
}

// Trigger lazy Redis connection at startup so errors surface early.
getRedis().connect().catch(() => {
  // Non-fatal — Redis errors are logged inside the client; healthz will reflect the state.
});

const server = app.listen(env.PORT, () => {
  logger.info({ port: env.PORT, env: env.NODE_ENV }, 'Server started');
});

// WORKER_INLINE=true: run BullMQ workers inside the web process (single-dyno mode).
// Trade-off: simpler ops, but CPU-heavy publishing competes with HTTP handling.
// For scale, run `node src/worker.js` as a separate process and set WORKER_INLINE=false.
if (env.WORKER_INLINE) {
  import('./worker.js').catch((err) => {
    logger.error({ err }, 'Failed to start inline workers');
  });
}

function shutdown(signal) {
  logger.info({ signal }, 'Shutdown signal received');
  server.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
