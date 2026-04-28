# Postly Backend

AI-powered social media scheduling API with a Telegram bot interface.

**Live URL:** https://postly-backend-production-5259.up.railway.app

**Health check:** https://postly-backend-production-5259.up.railway.app/api/v1/healthz

---

## What is Postly?

Postly is a backend service that lets users generate and schedule social media content across Twitter, LinkedIn, Instagram, and Threads using AI (OpenAI or Anthropic). Users interact via a REST API or a Telegram bot that guides them through the idea → generate → publish flow without needing a frontend. Posts are queued through BullMQ and published via platform clients, with per-platform retry logic and status tracking.

---

## Tech stack

| Layer | Choice | Why |
|---|---|---|
| Runtime | Node 20 | LTS, native fetch, ESM support |
| Framework | Express 4 | Mature, minimal overhead |
| ORM | Prisma 5 | Type-safe queries, migrations |
| Database | PostgreSQL | Relational, strong consistency |
| Cache / Queue | Redis + BullMQ | Fast key-value, reliable job queues |
| Bot | grammy + @grammyjs/conversations | Ergonomic Telegram bot with conversation state |
| AI | OpenAI SDK + Anthropic SDK | Support both GPT-4o and Claude models |
| Auth | JWT (access) + SHA-256 refresh tokens | Stateless access, revokable refresh |
| Deployment | Railway | Dockerfile-based, managed Postgres + Redis |

---

## Architecture (overview)

```
Client / Telegram
     │
     ▼
Express API (/api/v1/...)
     │
     ├── Auth middleware (JWT)
     ├── Rate limiter (Redis INCR/EXPIRE)
     │
     ├── Controllers → Services → Prisma (Postgres)
     │                     │
     │                     └── BullMQ queues (one per platform)
     │                               │
     │                               └── Workers → Platform clients
     │
     └── Telegram webhook → grammy bot (Redis session)
                                   │
                                   └── publishFlow → AI Service → OpenAI / Anthropic
```

See [ARCHITECTURE.md](./ARCHITECTURE.md) for the full breakdown.

---

## Local setup

```bash
# 1. Clone
git clone <repo-url> && cd postly-backend

# 2. Configure environment
cp .env.example .env
# Fill in DATABASE_URL, REDIS_URL, ENCRYPTION_KEY, JWT_SECRET, etc.
# Generate ENCRYPTION_KEY: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# 3. Start Postgres and Redis
docker compose up -d postgres redis

# 4. Run migrations
npx prisma migrate dev

# 5. Start the server
npm run dev
# In a second terminal (if WORKER_INLINE=false):
npm run worker
```

API available at `http://localhost:3000/api/v1`.

---

## Environment variables

| Variable | Description |
|---|---|
| `NODE_ENV` | `development` / `production` / `test` |
| `PORT` | HTTP port (default: 3000) |
| `DATABASE_URL` | PostgreSQL connection string |
| `REDIS_URL` | Redis connection string |
| `ENCRYPTION_KEY` | 64 hex chars (32 bytes) for AES-256-GCM |
| `JWT_SECRET` | Secret for signing JWTs (min 16 chars) |
| `JWT_EXPIRES_IN` | JWT validity period (default: `7d`) |
| `TELEGRAM_BOT_TOKEN` | Token from BotFather |
| `BOT_MODE` | `polling` (local) or `webhook` (production) |
| `TELEGRAM_WEBHOOK_SECRET` | Random secret appended to the webhook URL |
| `PUBLIC_URL` | Production base URL for webhook registration |
| `OPENAI_API_KEY` | Platform-level OpenAI fallback key |
| `ANTHROPIC_API_KEY` | Platform-level Anthropic fallback key |
| `OPENAI_MODEL` | Default: `gpt-4o-mini` |
| `ANTHROPIC_MODEL` | Default: `claude-haiku-4-5` |
| `RATE_LIMIT_WINDOW_MS` | Global rate limit window in ms (default: 60000) |
| `RATE_LIMIT_MAX` | Max requests per window (default: 100) |
| `TWITTER_API_KEY` | Twitter OAuth 1.0a app key |
| `TWITTER_API_SECRET` | Twitter OAuth 1.0a app secret |
| `WORKER_INLINE` | `true` = run workers inside web process (Railway single-dyno) |

---

## Telegram bot setup

### Local (polling mode)

1. Create a bot via [@BotFather](https://t.me/BotFather) and copy the token.
2. Set `TELEGRAM_BOT_TOKEN=<token>` and `BOT_MODE=polling` in `.env`.
3. Restart the server — the bot starts automatically.
4. Send `/start` to your bot.

### Production (webhook mode)

1. Set `BOT_MODE=webhook`, `TELEGRAM_WEBHOOK_SECRET=<random-string>`, and `PUBLIC_URL=https://your-app.railway.app` in Railway Variables.
2. Register the webhook with Telegram:

```bash
curl -X POST "https://api.telegram.org/bot<TOKEN>/setWebhook" \
  -d "url=<PUBLIC_URL>/telegram/webhook/<SECRET>"
```

Or run the helper script locally (requires env vars set):

```bash
node scripts/set-telegram-webhook.js
```

---

## API documentation

Import the Bruno collection at `bruno/postly/` into [Bruno](https://www.usebruno.com/), select either the `local` or `production` environment, and run `Login` first — it auto-captures the `accessToken` for subsequent requests.

---

## Testing

```bash
npm test
```

Requires a local PostgreSQL database `postly_test` and Redis. The test script sets `DATABASE_URL` automatically. To create the test DB schema:

```bash
npm run test:db:setup
```

---

## Deployment

Railway with Dockerfile build:

1. Connect the repo to Railway.
2. Add Postgres and Redis as Railway services; Railway injects `DATABASE_URL` and `REDIS_URL` as environment references.
3. Set all other env vars in the Railway Variables tab.
4. Deploy — the Dockerfile runs `prisma migrate deploy` before starting the server.
5. Set `healthcheckPath = "/api/v1/healthz"` in `railway.toml` (already committed).

---

## Known limitations

- **Twitter only**: Twitter is the only fully-implemented publishing client. LinkedIn, Instagram, and Threads exercise the queue/retry pipeline but throw `NotImplementedError` at publish time.
- **Worker inline**: Workers run in the same process as the web server by default (`WORKER_INLINE=true`) for Railway single-service deploys. Set `WORKER_INLINE=false` and run `node src/worker.js` as a separate service for production scale.
- **OAuth not implemented**: Social account tokens are stored directly via the API. The OAuth callback flow (Twitter PIN, LinkedIn redirect) is not implemented.

---

## References

- [ARCHITECTURE.md](./ARCHITECTURE.md) — deep-dive on data flow, schema design, auth, queues, and encryption
- [AI_USAGE.md](./AI_USAGE.md) — AI tooling disclosure
