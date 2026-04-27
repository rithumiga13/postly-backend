import { Bot } from 'grammy';
import { conversations, createConversation } from '@grammyjs/conversations';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { buildSessionStorage } from './session.js';
import { publishFlow } from './flows/publish.js';
import { handleStart } from './handlers/start.js';
import { handleLink } from './handlers/link.js';
import { handleStatus } from './handlers/status.js';
import { handleAccounts } from './handlers/accounts.js';
import { handleHelp } from './handlers/help.js';

let _bot = null;

function buildBot() {
  const storage = buildSessionStorage();

  const bot = new Bot(env.TELEGRAM_BOT_TOKEN);

  // v2: pass storage directly to conversations(); no separate session() needed.
  bot.use(
    conversations({
      storage: {
        type: 'key',
        adapter: storage,
        getStorageKey: (ctx) => ctx.chat?.id?.toString(),
      },
    }),
  );

  bot.use(createConversation(publishFlow));

  // /cancel when no conversation is active (inside a conversation it is caught
  // by the conversation.wait() loop in flows/publish.js).
  bot.command('cancel', async (ctx) => {
    await ctx.conversation.exitAll();
    await ctx.reply('No active conversation to cancel.');
  });

  bot.command('start', handleStart);
  bot.command('link', handleLink);
  bot.command('post', async (ctx) => {
    await ctx.conversation.enter('publishFlow');
  });
  bot.command('status', handleStatus);
  bot.command('accounts', handleAccounts);
  bot.command('help', handleHelp);

  // Fallback for stale callback queries (session expired, no active conversation)
  bot.on('callback_query:data', async (ctx) => {
    await ctx.answerCallbackQuery({ text: 'Session expired — use /post to start over.' });
  });

  // Fallback for unrecognised plain text
  bot.on('message:text', async (ctx) => {
    await ctx.reply('Use /post to create content, or /help for all commands.');
  });

  bot.catch((err) => {
    logger.error({ err: err.error, update: err.ctx?.update }, 'Unhandled bot error');
  });

  return bot;
}

export function initBot() {
  if (!env.TELEGRAM_BOT_TOKEN) {
    logger.warn('TELEGRAM_BOT_TOKEN not set — Telegram bot disabled');
    return null;
  }
  _bot = buildBot();
  return _bot;
}

export function getBot() {
  return _bot;
}
