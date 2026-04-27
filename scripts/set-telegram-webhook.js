/**
 * One-shot script: registers the bot's webhook URL with Telegram.
 *
 * Usage:
 *   node scripts/set-telegram-webhook.js
 *
 * Requires env vars: TELEGRAM_BOT_TOKEN, PUBLIC_URL, TELEGRAM_WEBHOOK_SECRET
 * Example .env entry:
 *   PUBLIC_URL=https://your-domain.com
 *   TELEGRAM_WEBHOOK_SECRET=some-long-random-string
 */

import 'dotenv/config';

const { TELEGRAM_BOT_TOKEN, PUBLIC_URL, TELEGRAM_WEBHOOK_SECRET } = process.env;

if (!TELEGRAM_BOT_TOKEN) {
  console.error('Missing TELEGRAM_BOT_TOKEN');
  process.exit(1);
}
if (!PUBLIC_URL) {
  console.error('Missing PUBLIC_URL (e.g. https://your-domain.com)');
  process.exit(1);
}
if (!TELEGRAM_WEBHOOK_SECRET) {
  console.error('Missing TELEGRAM_WEBHOOK_SECRET');
  process.exit(1);
}

const webhookUrl = `${PUBLIC_URL}/telegram/webhook/${TELEGRAM_WEBHOOK_SECRET}`;
const apiUrl = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook`;

const res = await fetch(apiUrl, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    url: webhookUrl,
    allowed_updates: ['message', 'callback_query'],
  }),
});

const body = await res.json();

if (body.ok) {
  console.log(`Webhook registered: ${webhookUrl}`);
} else {
  console.error('Failed to set webhook:', body);
  process.exit(1);
}
