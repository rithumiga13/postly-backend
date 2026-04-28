import prisma from '../../lib/prisma.js';

const PLATFORMS = ['twitter', 'linkedin', 'instagram', 'threads'];

export async function getStats(userId) {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [totalPosts, publishedPosts, platformGroups, last7Total, last7Published] = await Promise.all([
    prisma.post.count({ where: { userId } }),
    prisma.post.count({ where: { userId, status: 'published' } }),
    // groupBy on a nested relation where filter requires Prisma v4.3+; supported in v5.
    prisma.platformPost.groupBy({
      by: ['platform', 'status'],
      where: { post: { userId } },
      _count: { id: true },
    }),
    prisma.post.count({ where: { userId, createdAt: { gte: sevenDaysAgo } } }),
    prisma.post.count({ where: { userId, status: 'published', createdAt: { gte: sevenDaysAgo } } }),
  ]);

  const successRate = totalPosts === 0 ? 0 : publishedPosts / totalPosts;

  const perPlatform = Object.fromEntries(
    PLATFORMS.map((p) => [p, { published: 0, failed: 0, queued: 0, total: 0 }]),
  );

  for (const row of platformGroups) {
    const bucket = perPlatform[row.platform];
    if (!bucket) continue;
    const n = row._count.id;
    bucket.total += n;
    if (row.status === 'published') bucket.published += n;
    else if (row.status === 'failed') bucket.failed += n;
    else bucket.queued += n; // queued + processing + cancelled → queued bucket
  }

  return {
    totalPosts,
    successRate,
    perPlatform,
    last7Days: {
      totalPosts: last7Total,
      publishedPosts: last7Published,
    },
  };
}
