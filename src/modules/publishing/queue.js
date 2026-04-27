import { Queue } from 'bullmq';
import { env } from '../../config/env.js';

export const PLATFORMS = ['twitter', 'linkedin', 'instagram', 'threads'];

const DEFAULT_JOB_OPTIONS = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 1000 },
  removeOnComplete: { count: 100 },
  removeOnFail: { count: 500 },
};

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

// BullMQ forbids colons in queue names.
export function queueName(platform) {
  return `publishing-${platform}`;
}

const queues = {};

export function getQueue(platform) {
  if (!queues[platform]) {
    queues[platform] = new Queue(queueName(platform), {
      connection: getConnectionOpts(),
      defaultJobOptions: DEFAULT_JOB_OPTIONS,
    });
  }
  return queues[platform];
}

export async function enqueuePlatformPost({ platformPostId, userId, platform, publishAt }) {
  const queue = getQueue(platform);
  const delay = publishAt ? Math.max(0, new Date(publishAt).getTime() - Date.now()) : 0;
  await queue.add(
    `publish-${platformPostId}`,
    { platformPostId, userId, platform },
    delay > 0 ? { delay } : {},
  );
}
