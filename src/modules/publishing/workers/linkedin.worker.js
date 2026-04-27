import { Worker } from 'bullmq';
import { env } from '../../../config/env.js';
import { logger } from '../../../config/logger.js';
import { processJob, onFailed } from './processor.js';
import { queueName } from '../queue.js';

function getConnectionOpts() {
  const url = new URL(env.REDIS_URL);
  const opts = {
    host: url.hostname,
    port: Number(url.port) || 6379,
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  };
  if (url.password) opts.password = decodeURIComponent(url.password);
  if (url.username && url.username !== 'default') opts.username = decodeURIComponent(url.username);
  return opts;
}

export function createLinkedinWorker() {
  const worker = new Worker(queueName('linkedin'), processJob, {
    connection: getConnectionOpts(),
    concurrency: 5,
  });

  worker.on('completed', (job) => {
    logger.info({ jobId: job.id }, 'linkedin job completed');
  });

  worker.on('failed', async (job, err) => {
    logger.error({ jobId: job?.id, attemptsMade: job?.attemptsMade, err }, 'linkedin job failed');
    if (job && job.attemptsMade >= (job.opts.attempts ?? 1)) {
      await onFailed(job, err);
    }
  });

  worker.on('error', (err) => {
    logger.error({ err }, 'linkedin worker error');
  });

  return worker;
}
