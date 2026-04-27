import prisma from '../../../lib/prisma.js';
import { logger } from '../../../config/logger.js';
import { getDecryptedToken } from '../../socialAccounts/socialAccounts.service.js';
import { getTwitterClient } from '../platforms/twitter.client.js';
import { getLinkedinClient } from '../platforms/linkedin.client.js';
import { getInstagramClient } from '../platforms/instagram.client.js';
import { getThreadsClient } from '../platforms/threads.client.js';

const clients = {
  twitter: getTwitterClient(),
  linkedin: getLinkedinClient(),
  instagram: getInstagramClient(),
  threads: getThreadsClient(),
};

const TERMINAL = new Set(['published', 'failed', 'cancelled']);

async function updateParentPostStatus(postId) {
  const platformPosts = await prisma.platformPost.findMany({ where: { postId } });
  const allPublished = platformPosts.every((pp) => pp.status === 'published');
  const anyFailed = platformPosts.some((pp) => pp.status === 'failed');
  const allTerminal = platformPosts.every((pp) => TERMINAL.has(pp.status));

  if (allPublished) {
    await prisma.post.update({ where: { id: postId }, data: { status: 'published' } });
  } else if (anyFailed && allTerminal) {
    await prisma.post.update({ where: { id: postId }, data: { status: 'failed' } });
  }
}

export async function processJob(job) {
  const { platformPostId, userId, platform } = job.data;

  const platformPost = await prisma.platformPost.findUnique({
    where: { id: platformPostId },
    include: { post: true },
  });

  if (!platformPost) {
    logger.warn({ platformPostId }, 'PlatformPost not found — job orphaned, skipping');
    return;
  }

  await prisma.platformPost.update({
    where: { id: platformPostId },
    data: { status: 'processing', attempts: { increment: 1 } },
  });

  try {
    const tokens = await getDecryptedToken(userId, platform);
    const result = await clients[platform].post(platformPost.content, tokens);

    await prisma.platformPost.update({
      where: { id: platformPostId },
      data: {
        status: 'published',
        publishedAt: new Date(),
        externalId: result.externalId,
        errorMessage: null,
      },
    });

    await updateParentPostStatus(platformPost.postId);
  } catch (err) {
    logger.error({ err, platformPostId, platform }, 'Platform post processing failed');
    throw err;
  }
}

export async function onFailed(job, err) {
  const { platformPostId } = job.data;
  try {
    const platformPost = await prisma.platformPost.findUnique({ where: { id: platformPostId } });
    if (!platformPost) return;

    await prisma.platformPost.update({
      where: { id: platformPostId },
      data: { status: 'failed', errorMessage: err.message },
    });

    await updateParentPostStatus(platformPost.postId);
  } catch (updateErr) {
    logger.error({ updateErr, platformPostId }, 'Failed to persist final failure state');
  }
}
