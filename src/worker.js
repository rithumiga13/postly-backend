import { createTwitterWorker } from './modules/publishing/workers/twitter.worker.js';
import { createLinkedinWorker } from './modules/publishing/workers/linkedin.worker.js';
import { createInstagramWorker } from './modules/publishing/workers/instagram.worker.js';
import { createThreadsWorker } from './modules/publishing/workers/threads.worker.js';
import { logger } from './config/logger.js';

export function startWorkers() {
  const workers = [
    createTwitterWorker(),
    createLinkedinWorker(),
    createInstagramWorker(),
    createThreadsWorker(),
  ];
  logger.info('All platform workers started');
  return workers;
}

startWorkers();
