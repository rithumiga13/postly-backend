# Architecture

## 1. Data flow

```
Telegram User
    │
    ▼
POST /telegram/webhook/:secret
    │
    ▼
grammy bot (Redis session: tg:session:{chatId}, TTL 30 min)
    │
    ├── /link  → auth.service.login() → prisma.user.update(telegramChatId)
    ├── /start → prisma.user.findFirst(telegramChatId)
    ├── /status → posts.service.listPosts()
    └── /post  → publishFlow conversation
                    │
                    ├── conversation.external() → ai.service.generateForAll()
                    │       │
                    │       └── OpenAI SDK / Anthropic SDK
                    │
                    └── conversation.external() → posts.service.publishPost()
                            │
                            └── prisma.$transaction (Post + PlatformPost rows)
                                    │
                                    └── enqueuePlatformPost() → BullMQ queue
                                                                    │
                                                                    └── Worker → Platform client
                                                                                    │
                                                                                    └── prisma.platformPost.update(status)

REST Client
    │
    ▼
POST /api/v1/auth/login → auth.service → bcrypt → JWT pair
GET  /api/v1/auth/me → requireAuth middleware → controller
POST /api/v1/content/generate → ai.service → OpenAI / Anthropic → response
POST /api/v1/posts/publish → posts.service → Prisma → BullMQ → workers
GET  /api/v1/dashboard/stats → dashboard.service → Prisma groupBy
```

---

## 2. Conversation state in Redis

- **Key**: `tg:session:{chatId}`
- **TTL**: 30 minutes, reset on every write
- **Stored**: @grammyjs/conversations v2 serialized state — current step, collected selections (postType, platforms, tone, model, idea, generated content)
- **Adapter**: custom `buildSessionStorage()` in `src/modules/telegram/session.js` — reads/writes JSON, sets EX on every write

---

## 3. Schema design

### Why a separate `PlatformPost` table

Each `Post` has one `PlatformPost` row per target platform. This supports:
- Per-platform status (`queued`, `processing`, `published`, `failed`) independent of siblings
- Per-platform `externalId` (the ID returned by the platform API after publishing)
- Per-platform retry without re-posting to already-published platforms
- Per-platform error messages

### Why a `RefreshToken` table

Stateful refresh tokens enable:
- **Rotation**: every `/refresh` mints a new pair, marks the old token as revoked with `replacedBy = newTokenId`
- **Theft detection**: if a revoked token is presented, all of the user's tokens are revoked immediately (forces full re-login)
- **Selective revocation**: `/logout` revokes the specific token without affecting other sessions

### Indexes

| Index | Purpose |
|---|---|
| `User.email` unique | Login lookup |
| `Post (userId, createdAt)` | List posts in chronological order |
| `Post.status` | Filter by status (queue sweeper, retry) |
| `PlatformPost.status` | Worker polling, dashboard groupBy |
| `SocialAccount (userId, platform)` unique | Prevent duplicate connected accounts |
| `RefreshToken.tokenHash` unique | O(1) token lookup on refresh/logout |

---

## 4. Queue architecture

### Why per-platform queues

Each platform (`publishing-twitter`, `publishing-linkedin`, etc.) has its own BullMQ queue. Benefits:
- **Failure isolation**: a buggy LinkedIn client doesn't block Twitter jobs
- **Independent throughput**: each queue can have different concurrency and retry settings
- **Simpler reasoning**: one queue per concern, not a shared queue with platform routing

### Retry policy

- Max 3 attempts per job
- Exponential backoff: `delay = 1000 * 2^(attempt - 1)` ms (1s → 2s → 4s)
- After all attempts fail, `PlatformPost.status` is set to `failed` and `errorMessage` is recorded
- The `/posts/:id/retry` endpoint requeues only `failed` PlatformPosts of a given Post

### Concurrency

- 5 concurrent jobs per worker per platform
- Workers boot inside the web process by default (`WORKER_INLINE=true`)

### `WORKER_INLINE` flag

When `true` (default), workers start in the same Node.js process as the Express server. This allows a single Railway service (one Dockerfile, one dyno) to handle both web traffic and queue processing. Set to `false` to run `node src/worker.js` as a separate process or Railway service for production scale.

---

## 5. Partial failure semantics

Each `PlatformPost` is processed independently:
- If Twitter publishes and LinkedIn fails, Twitter's row is `published` and LinkedIn's is `failed`
- The parent `Post.status` does not roll up automatically — it stays `queued`/`processing` until a worker updates it, or the user retries
- The retry endpoint requeues only `failed` PlatformPosts; already-`published` ones are not re-sent

---

## 6. Auth design

| Concern | Approach |
|---|---|
| Password hashing | bcrypt, cost factor 12 |
| Access token | 15-minute signed JWT (`type: "access"`) |
| Refresh token | 7-day random 64-byte hex; SHA-256 hash stored in `RefreshToken` table |
| Rotation | Every `/auth/refresh` mints a new pair; old token marked `revokedAt = now`, `replacedBy = newId` |
| Theft detection | Presenting a revoked refresh token triggers full-session revocation for the user (all tokens revoked) |
| Logout | Marks the specific refresh token as revoked; access token expires naturally |

---

## 7. Encryption at rest

**Algorithm**: AES-256-GCM with a random 12-byte IV per record.

**Storage format**: `base64(iv):base64(authTag):base64(ciphertext)` — three colon-separated segments.

**Key source**: `ENCRYPTION_KEY` env var (64 hex chars = 32 bytes). Never rotated automatically; changing it requires re-encrypting all records.

**Applied to**:
- `SocialAccount.accessTokenEnc` — OAuth access token
- `SocialAccount.refreshTokenEnc` — OAuth refresh token (if applicable)
- `AiKey.openaiKeyEnc` — user's OpenAI API key
- `AiKey.anthropicKeyEnc` — user's Anthropic API key

**Never returned** in API responses. Decryption happens only at the call site that needs the plaintext (publishing worker, AI service).

---

## 8. Rate limiting

Redis-backed fixed-window limiter in `src/middleware/rateLimit.js`.

**Algorithm**:
1. Build key: `{prefix}:{identifier}` where identifier is IP or `userId`
2. `INCR` the key — atomically increments and returns new count
3. On first increment (`count === 1`), `EXPIRE key windowSeconds` — sets the window
4. If `count > max`, return `429` with `{ error: { code: "rate_limited", message: "... try again in Xs" } }`
5. Set `X-RateLimit-{Limit,Remaining,Reset}` headers on every response

**Applied limits**:
- `POST /auth/login` and `POST /auth/register`: 5 req / 60s / IP
- `POST /content/generate`: 10 req / 60s / userId (runs after `requireAuth`)

**Trade-off**: A fixed window has a burst problem (2× max at window boundary). A true sliding window would require a sorted set per key. The fixed window is simpler to reason about and sufficient for this use case.

---

## 9. Known limitations

| Limitation | Rationale |
|---|---|
| Twitter is the only real publisher | LinkedIn / Instagram / Threads require platform-specific OAuth and API review; stubs exercise the retry pipeline |
| Workers run inline with the web process | Single Railway service is simpler to operate; `WORKER_INLINE=false` enables separate scaling |
| OAuth callback flows not implemented | Tokens are accepted directly via the API; full OAuth would require platform app registration and redirect handling |
| Fixed-window rate limiter | Simpler than sliding window; good enough for current traffic patterns |
| No scheduled-post sweeper | Scheduled posts rely on BullMQ delayed jobs; a periodic sweeper would handle clock drift |

---

## 10. What I'd build next

- Full OAuth callback flow for Twitter (PIN-based) and LinkedIn (redirect)
- Real LinkedIn, Instagram, and Threads publishing clients
- Scheduled-post cron sweeper to catch BullMQ delayed-job drift
- Per-post analytics endpoint pulling engagement stats from platform APIs
- Soft-delete and restore for posts (currently hard-delete only)
- Sliding-window rate limiter using Redis sorted sets
- Multi-user Telegram bot with proper account isolation (currently one session per chatId)
