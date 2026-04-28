import express from 'express';
import { errorHandler } from './middleware/error.js';
import { defaultRateLimit } from './middleware/rateLimit.js';
import router from './routes/index.js';
import { env } from './config/env.js';
import { getBot } from './modules/telegram/bot.js';
import { logger } from './config/logger.js';

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(defaultRateLimit);

// Telegram webhook — mounted outside /api so the URL is clean.
// Only active when BOT_MODE=webhook; returns 503 in polling mode (bot not reachable via HTTP).
app.post('/telegram/webhook/:secret', async (req, res) => {
  if (env.BOT_MODE !== 'webhook') return res.sendStatus(404);
  const bot = getBot();
  if (!bot) return res.sendStatus(503);
  if (req.params.secret !== env.TELEGRAM_WEBHOOK_SECRET) return res.sendStatus(404);
  try {
    await bot.handleUpdate(req.body);
    res.sendStatus(200);
  } catch (err) {
    logger.error({ err }, 'Webhook handler error');
    res.sendStatus(500);
  }
});

app.get('/', (_req, res) => res.redirect('/api/v1/healthz'));

app.use('/api', router);

// 404 — must come after all routes.
app.use((_req, res) => {
  res.status(404).json({
    data: null,
    meta: {},
    error: { code: 'NOT_FOUND', message: 'Route not found' },
  });
});

app.use(errorHandler);

export default app;
