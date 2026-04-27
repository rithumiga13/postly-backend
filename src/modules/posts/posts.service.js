import prisma from '../../lib/prisma.js';
import { enqueuePlatformPost } from '../publishing/queue.js';
import { NotFoundError, AppError } from '../../lib/errors.js';

const NON_DELETABLE = new Set(['published', 'processing']);

export async function publishPost(userId, { idea, generated, postType, tone, language, modelUsed }) {
  return _createAndEnqueue(userId, { idea, generated, postType, tone, language, modelUsed, publishAt: null });
}

export async function schedulePost(userId, { idea, generated, postType, tone, language, modelUsed, publishAt }) {
  return _createAndEnqueue(userId, { idea, generated, postType, tone, language, modelUsed, publishAt });
}

async function _createAndEnqueue(userId, { idea, generated, postType, tone, language, modelUsed, publishAt }) {
  const platforms = Object.keys(generated);

  const post = await prisma.$transaction(async (tx) => {
    return tx.post.create({
      data: {
        userId,
        idea,
        postType,
        tone,
        language,
        modelUsed,
        publishAt: publishAt ? new Date(publishAt) : null,
        status: 'queued',
        platformPosts: {
          create: platforms.map((platform) => ({
            platform,
            content: generated[platform].content,
            status: 'queued',
          })),
        },
      },
      include: { platformPosts: true },
    });
  });

  // Enqueue outside the transaction so the DB commit is durable before touching Redis.
  for (const pp of post.platformPosts) {
    await enqueuePlatformPost({
      platformPostId: pp.id,
      userId,
      platform: pp.platform,
      publishAt: post.publishAt,
    });
  }

  return { post };
}

export async function listPosts(userId, { page, limit, status, platform, from, to }) {
  const where = { userId };

  if (status) where.status = status;
  if (from || to) {
    where.createdAt = {};
    if (from) where.createdAt.gte = new Date(from);
    if (to) where.createdAt.lte = new Date(to);
  }
  if (platform) {
    where.platformPosts = { some: { platform } };
  }

  const [posts, total] = await prisma.$transaction([
    prisma.post.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: { platformPosts: true },
    }),
    prisma.post.count({ where }),
  ]);

  return { posts, total };
}

export async function getPost(userId, postId) {
  const post = await prisma.post.findFirst({
    where: { id: postId, userId },
    include: { platformPosts: true },
  });
  if (!post) throw new NotFoundError('Post not found');
  const { platformPosts, ...rest } = post;
  return { post: rest, platformPosts };
}

export async function retryPost(userId, postId) {
  const post = await prisma.post.findFirst({
    where: { id: postId, userId },
    include: { platformPosts: { where: { status: 'failed' } } },
  });
  if (!post) throw new NotFoundError('Post not found');
  if (post.platformPosts.length === 0) {
    throw new AppError('No failed platform posts to retry', 400, 'NOTHING_TO_RETRY');
  }

  await prisma.platformPost.updateMany({
    where: { postId, status: 'failed' },
    data: { status: 'queued', errorMessage: null },
  });

  await prisma.post.update({ where: { id: postId }, data: { status: 'queued' } });

  for (const pp of post.platformPosts) {
    await enqueuePlatformPost({
      platformPostId: pp.id,
      userId,
      platform: pp.platform,
      publishAt: post.publishAt,
    });
  }

  const updated = await prisma.post.findUnique({
    where: { id: postId },
    include: { platformPosts: true },
  });
  return { post: updated };
}

export async function deletePost(userId, postId) {
  const post = await prisma.post.findFirst({ where: { id: postId, userId } });
  if (!post) throw new NotFoundError('Post not found');

  if (NON_DELETABLE.has(post.status)) {
    throw new AppError(
      `Cannot delete a post with status "${post.status}"`,
      409,
      'POST_NOT_DELETABLE',
    );
  }

  await prisma.post.delete({ where: { id: postId } });
  return { ok: true };
}
