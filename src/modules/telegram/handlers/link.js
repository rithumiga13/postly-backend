import prisma from '../../../lib/prisma.js';
import { login } from '../../auth/auth.service.js';

export async function handleLink(ctx) {
  const args = (ctx.match ?? '').trim().split(/\s+/).filter(Boolean);

  if (args.length < 2) {
    await ctx.reply('Usage: /link <email> <password>');
    return;
  }

  const [email, password] = args;
  const chatId = String(ctx.from.id);

  const already = await prisma.user.findFirst({ where: { telegramChatId: chatId } });
  if (already) {
    await ctx.reply(`Already linked to ${already.email}. Use /start to continue.`);
    return;
  }

  let user;
  try {
    const result = await login({ email, password });
    user = result.user;
  } catch {
    await ctx.reply('Invalid email or password. Please check your credentials and try again.');
    return;
  }

  if (user.telegramChatId && user.telegramChatId !== chatId) {
    await ctx.reply('That Postly account is already linked to a different Telegram chat.');
    return;
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { telegramChatId: chatId },
  });

  await ctx.reply(`Linked! Welcome, ${user.name}.\n\nUse /post to start creating content.`);
}
