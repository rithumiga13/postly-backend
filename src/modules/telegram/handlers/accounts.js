import prisma from '../../../lib/prisma.js';
import { listAccounts } from '../../socialAccounts/socialAccounts.service.js';

export async function handleAccounts(ctx) {
  const chatId = String(ctx.from.id);
  const user = await prisma.user.findFirst({ where: { telegramChatId: chatId } });

  if (!user) {
    await ctx.reply('Link your account first: /link <email> <password>');
    return;
  }

  const { accounts } = await listAccounts(user.id);

  if (accounts.length === 0) {
    await ctx.reply('No social accounts connected. Connect them via the API.');
    return;
  }

  const lines = accounts.map((a) => `• ${a.platform}: ${a.handle ?? '(no handle)'}`);
  await ctx.reply(`Connected accounts:\n\n${lines.join('\n')}`);
}
