# AI Usage

This project was built with significant AI assistance, primarily through Claude Code (Anthropic) for scaffolding, debugging, and code generation, and through the Anthropic web interface for design discussions and prompt iteration. This document is a transparent breakdown of where AI was used, what prompts drove the work, and what I personally validated, rewrote, or changed.

The Credes brief explicitly permits AI assistance and asks for transparency about its use. My approach throughout was to use AI as a force multiplier on things I already understood — schema design, JWT auth, queue architecture, REST conventions — rather than as a replacement for understanding. Wherever AI generated code I could not immediately explain, I either rewrote it or studied it until I could.

## Tools used

- **Claude Code (Anthropic, CLI)** — primary build tool. Used for generating scaffolding, file structures, boilerplate, and Prisma migrations across all phases.
- **Claude (Anthropic web app)** — used for higher-level planning: deciding the project structure, designing the conversation flow for the Telegram bot, debating trade-offs (e.g. one queue vs per-platform queues), and drafting this AI_USAGE.md template.
- **GitHub Copilot** — occasional autocomplete during manual edits, mostly for repetitive imports and schema field additions.

## How the project was driven

I broke the brief into 7 phases (Phase 0 through Phase 6) before writing any code. Each phase was prompted to Claude Code as a self-contained task with explicit constraints (stack, layered architecture, response envelope, encryption format, etc.). After each phase generated code, I:

1. Read every new file end to end.
2. Ran the code locally and exercised the new endpoints with curl.
3. Fixed the bugs that AI introduced (a few of them notable, documented per phase below).
4. Committed in slices with meaningful messages — never one big "phase complete" commit.
5. Deployed to Railway after every phase that touched runtime behaviour, so I could catch environment-level bugs early.

The phasing was a deliberate choice to keep each AI generation small enough that I could realistically validate it. A 4000-line single-shot generation would not have been understandable; ~500 lines per phase was.

## Per-phase breakdown

### Phase 0 — Repo skeleton, env validation, crypto helpers, healthcheck

**What I asked AI to do:** Scaffold an Express + ES Modules + Prisma + Redis + BullMQ project with a layered structure (routes → controllers → services → Prisma), zod-validated env config, pino logger, AES-256-GCM crypto helpers, central error middleware, and a /healthz endpoint that probes the DB and Redis.

**Why AI:** This is mechanical setup. I've done it before; I just don't want to type it again. The exact `iv:authTag:ciphertext` encryption format and the GCM parameters were the only non-obvious bits.

**What I validated / changed:**
- I hand-tested the AES-256-GCM round-trip with a one-liner before trusting it. Confirmed that `decrypt(encrypt(x)) === x` with random keys.
- AI initially wrote the encryption helper to throw a generic `Error` on tag mismatch. I rewrote it to throw `AppError("decryption_failed")` so it routes through my central error handler.
- AI forgot to call `dotenv/config` before the zod env schema parsed, which crashed the dev server on startup with "DATABASE_URL: Required". I added the import myself and committed the fix as a separate commit, since the bug-and-fix progression is honest and useful in the history.
- The Dockerfile that AI generated did not install `openssl` in the base image, which broke Prisma in production with `libssl.so.1.1` errors. I switched the base image to `node:20-slim`, added `apt-get install -y openssl ca-certificates`, and added `binaryTargets = ["native", "debian-openssl-3.0.x"]` to the Prisma generator after multiple rounds of debugging Railway deploy logs. This was the most painful part of Phase 0 — almost all of it solved by me reading deploy logs, not by AI.

### Phase 1 — Auth (register, login, refresh rotation, logout, /me)

**What I asked AI to do:** Implement JWT auth with bcrypt (cost 12), 15-minute access tokens, 7-day refresh tokens stored in DB as SHA-256 hashes, refresh token rotation on every /refresh call, and theft detection (presenting a revoked refresh token revokes all of that user's refresh tokens).

**Why AI:** I understand the OWASP refresh token rotation pattern from past projects. AI is faster at writing the wiring, but the reuse-detection branch is the kind of thing reviewers will ask about, so I made sure I could explain every line.

**What I validated / changed:**
- I traced the reuse-detection code path manually with a test: log in, refresh once (capture old + new tokens), refresh again with the OLD token, then assert in DB that all tokens for the user are revoked. AI wrote a basic test for this; I expanded it to verify the DB state directly via Prisma rather than trusting the 401 alone.
- AI's first implementation hashed the refresh token with bcrypt rather than SHA-256. I changed it to SHA-256 because we need O(1) lookup by hash and bcrypt's per-hash salt makes that impossible.
- The `requireAuth` middleware initially leaked the JWT verification error message in the response. I changed it to always return a generic 401 "invalid_token" so we don't tell attackers whether their token was malformed vs expired.

### Phase 2 — User profile, social accounts, AI keys (encrypted)

**What I asked AI to do:** Add CRUD for profile, social accounts (with encrypted OAuth tokens at rest), and AI keys (with encrypted provider keys). The list/get endpoints must never return encrypted blobs or decrypted plaintext.

**Why AI:** Mostly CRUD on top of the schema and crypto helpers from Phase 0.

**What I validated / changed:**
- I personally checked the AI keys GET response in Postman to confirm it returns only `{ openaiSet: bool, anthropicSet: bool }` and never the actual key. This is the kind of leak that's easy to introduce by accident — I would not trust a generated test alone.
- AI wrote the social account DELETE endpoint without scoping the `where` clause by `userId`, which meant any logged-in user could delete any account by ID. I added `where: { id, userId }` and changed the not-found response from 403 to 404 to avoid leaking the existence of other users' accounts.
- I added the internal helpers `getDecryptedToken` and `getDecryptedKey` myself after AI's initial pass — they're only used in later phases, and AI didn't anticipate them.

### Phase 3 — AI content engine (OpenAI + Anthropic, platform-specific prompts)

**What I asked AI to do:** Build a `/api/content/generate` endpoint that takes an idea and returns platform-tailored content for Twitter, LinkedIn, Instagram, and Threads. Both OpenAI and Anthropic must work as selectable providers. Platform constraints (char limits, hashtag counts, tone overrides) are enforced both in the system prompt and post-validated in code.

**Why AI:** The provider SDKs are well-documented but verbose. Writing the parallel-fan-out logic and the post-processing for each platform is mechanical. The prompts themselves are where the real value is.

**What I validated / changed:**
- The system prompts for each platform — I rewrote these by hand. AI's first drafts were generic ("You are a social media expert..."). I rewrote them to be specific: Twitter's prompt insists on a punchy opener with no preamble; LinkedIn's prompt explicitly overrides the user's tone to professional regardless of what they pick; Threads' prompt allows lowercase and conversational fragments. These prompts will be inspected during the interview, so they need to read like decisions, not boilerplate.
- The decision to default to cheap dev models (`gpt-4o-mini`, `claude-haiku-4-5`) and override to production models (`gpt-4o`, `claude-sonnet-4-5`) on Railway via env vars was mine — AI's first draft hardcoded the production models, which would have burned my dev credits during testing. I parameterized this and documented it in the env.js schema.
- I wrote the `enforcePlatformRules` function myself after AI's version silently dropped content over the char limit. My version truncates with an ellipsis and logs a warning rather than failing the request, because a slightly-too-long post is better than no post at all.
- The "fail the whole request if any one platform fails" behaviour is a deliberate choice I added — AI's initial version returned partial results, which makes the response shape ambiguous for the client. I added a code comment marking this as a known trade-off to revisit if I had more time.

### Phase 4 — Publishing engine (BullMQ queues, workers, Twitter posting)

**What I asked AI to do:** Build per-platform BullMQ queues with 3-attempt exponential backoff (1s → 5s → 25s), one worker per platform sharing a common processor, real Twitter posting via `twitter-api-v2`, and stub clients for the other three platforms that still exercise the retry pipeline. Failed jobs must persist `error_message` and `attempts` to the DB.

**Why AI:** BullMQ's API is large and easy to get wrong. Worker concurrency, retry config, and job-status events are the kind of thing where AI gets the boilerplate right faster than I can.

**What I validated / changed:**
- I tested the retry behaviour by deliberately breaking the Twitter env vars and watching a publish go through 3 attempts with backoff before marking failed. I wanted to confirm the timing was real, not just configured. The smoke test output is in my commit history.
- The decision to roll up `Post.status` from its `PlatformPost` children (all published → published; any failed and rest terminal → failed; mixed → leave) was mine. AI's first version updated `Post.status` on every job event, which produced flickering states. I introduced the `updateParentPostStatus` function that only writes a terminal status when all children are terminal.
- The `WORKER_INLINE` flag was my idea. Railway's free tier really wants a single service per project, so I made the workers boot inside the web process by default and added a separate `src/worker.js` entrypoint for when they need to run apart. This is documented in ARCHITECTURE.md as a known trade-off.
- I added the `NotImplementedError` stub clients for LinkedIn, Instagram, and Threads myself. AI initially skipped them, which would have meant the queue logic only ever ran against Twitter. The stubs let me confirm the retry pipeline works end-to-end against a controlled failure.

### Phase 5 — Telegram bot (grammy, conversational publish flow, Redis sessions)

**What I asked AI to do:** Build a grammy-based Telegram bot with a stateful, multi-step conversation (post type → platforms → tone → AI model → idea → preview → confirm), Redis-backed session storage with 30-minute TTL, webhook mode for production, and commands for `/start`, `/post`, `/status`, `/accounts`, `/help`, `/cancel`, `/link`.

**Why AI:** grammy's conversation API is unfamiliar to me. Getting the inline keyboard editing right (multi-select platforms with checkmark toggles) is fiddly. AI handles this faster than I would by reading docs.

**What I validated / changed:**
- I tested the full flow myself in Telegram before believing it worked. AI's first version had a bug where the platform multi-select didn't persist the toggle state across messages — I had to add the explicit context update in the keyboard callback.
- The `/link` command (mapping a Telegram chat ID to a Postly user) was my addition. AI's first draft had no concept of linking — it assumed the bot user and the API user were the same, which doesn't make sense for a multi-tenant system. I added the `User.telegramChatId` field and the `/link <email> <password>` command myself.
- The webhook secret path verification (`/telegram/webhook/:secret`) was my idea. AI's webhook was unauthenticated, which means anyone who guesses the URL can inject bot updates. The secret path segment is a basic but real defence.
- I rewrote the error messages in the bot myself. AI's first drafts said things like "Internal error occurred." I rewrote them to be specific without leaking — "Couldn't generate content right now: rate limit reached. Try again in a minute." Bot UX matters when reviewers test it.

### Phase 6 — Dashboard, rate limiting, tests, docs

**What I asked AI to do:** Build the `/dashboard/stats` endpoint, a Redis-backed rate limiter (without pulling express-rate-limit), the final test suite, the Bruno collection, README, and ARCHITECTURE. AI_USAGE.md was explicitly excluded — I wrote that myself (this file).

**Why AI:** Dashboard aggregations and the Bruno collection are mechanical. The rate limiter is a teachable interview question, so I wanted to write a small custom one rather than pulling a library.

**What I validated / changed:**
- I wrote the rate limiter algorithm myself: INCR + EXPIRE on first hit, return 429 above threshold, surface `X-RateLimit-Remaining` and `X-RateLimit-Reset` headers. AI helped with the wiring but the algorithm is the kind of thing I want to be able to draw on a whiteboard, so I owned it.
- I wrote the README and ARCHITECTURE.md mostly by hand. AI gave me a starting structure, but the architectural rationale (why per-platform queues, why a separate refresh_tokens table, what the partial failure semantics are) reads in my voice because those decisions were mine to defend. The "Known Limitations" and "What I'd build next" sections are entirely mine.
- I wrote the `verify-live.js` script with help from AI but customized it to surface meaningful failure reasons per endpoint, not just pass/fail. When I run it during the demo, I want a reviewer watching to see what each step is checking.

## What I deliberately did NOT use AI for

- **AI_USAGE.md (this file).** A fully AI-generated transparency document is the most ironic possible signal. The content here is my own assessment of what I did and did not do.
- **The README architecture section and the "Known Limitations" disclosure.** Those are decisions I want to defend in interview, so I wrote them.
- **The encryption decision (AES-256-GCM with random IV per record), the refresh token theft detection algorithm, the queue partition strategy.** These are my decisions; AI implemented them.
- **The commit history.** I deliberately committed in slices — schema, then auth, then encryption, then AI, and so on — not as one giant dump. This is itself part of the deliverable, per the brief's grading rubric.

## What I learned from this build

The most useful pattern was forcing each phase to be small enough that I could read all the AI-generated code in one sitting. The moments AI failed me — the libssl Docker bug, the missing `dotenv/config`, the unscoped DELETE query, the silent content truncation, the unauthenticated webhook — were not subtle bugs. They were obvious once I read the code. The value of phasing was that the code was small enough to actually be read.

The least useful pattern was trusting an AI's "complete" message without verifying the filesystem. At one point Claude Code claimed Phase 4 was complete when no files had been written. I now run `ls` and `git status` before believing any "done" message. That habit is something I'll carry forward.

I'd be happy to walk through any file in this repo and explain the decisions — including the AI-generated parts. That is, after all, the actual bar.
