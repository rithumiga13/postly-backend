import prisma from '../../../lib/prisma.js';

export async function handleStart(ctx) {
  const chatId = String(ctx.from.id);
  const user = await prisma.user.findFirst({ where: { telegramChatId: chatId } });

  if (user) {
    await ctx.reply(
      `Hey ${user.name}! Welcome back.\n\nUse /post to create content, or /help for all commands.`,
    );
  } else {
    await ctx.reply(
      'Welcome to Postly!\n\n' +
        'To get started:\n' +
        '1. Register via the API: POST /api/auth/register\n' +
        '2. Link your account here: /link <email> <password>\n\n' +
        'Once linked, use /post to start creating content.',
    );
  }
}
