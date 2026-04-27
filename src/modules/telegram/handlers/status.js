import prisma from '../../../lib/prisma.js';
import { listPosts } from '../../posts/posts.service.js';

const STATUS_EMOJI = {
  published: '✅',
  queued: '⏳',
  processing: '⏳',
  failed: '❌',
  cancelled: '🚫',
};

export async function handleStatus(ctx) {
  const chatId = String(ctx.from.id);
  const user = await prisma.user.findFirst({ where: { telegramChatId: chatId } });

  if (!user) {
    await ctx.reply('Link your account first: /link <email> <password>');
    return;
  }

  const { posts } = await listPosts(user.id, { page: 1, limit: 5 });

  if (posts.length === 0) {
    await ctx.reply('No posts yet. Use /post to create your first one!');
    return;
  }

  const lines = posts.map((post, i) => {
    const snippet = post.idea.length > 50 ? post.idea.slice(0, 50) + '…' : post.idea;
    const platforms = post.platformPosts
      .map((pp) => `  ${STATUS_EMOJI[pp.status] ?? '⏳'} ${pp.platform}`)
      .join('\n');
    return `${i + 1}. [${post.postType}] "${snippet}"\n${platforms}`;
  });

  await ctx.reply(`Your last ${posts.length} posts:\n\n${lines.join('\n\n')}`);
}
