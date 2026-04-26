
# Postly

**Live API:** https://postly-backend-production-5259.up.railway.app
Node.js REST API for the Postly social scheduling platform.

## Prerequisites

- Node.js >= 20
- Docker and Docker Compose

## Local setup

```bash
# 1. Install dependencies
npm install

# 2. Copy env file and fill in values
cp .env.example .env

# 3. Generate a 32-byte encryption key and paste it into .env
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# 4. Start Postgres and Redis
docker compose up postgres redis -d

# 5. Run migrations
npm run prisma:migrate

# 6. Start the dev server
npm run dev
```

The API will be available at `http://localhost:3000/api/v1`.
Health check: `GET /api/v1/healthz`

## Running with Docker Compose (full stack)

```bash
docker compose up --build
```

## Scripts

| Script | Description |
|---|---|
| `npm run dev` | Dev server with hot-reload (nodemon) |
| `npm start` | Production server |
| `npm test` | Run Jest tests |
| `npm run lint` | ESLint |
| `npm run prisma:migrate` | Run Prisma migrations |
| `npm run prisma:studio` | Open Prisma Studio |
| `npm run worker` | Start BullMQ worker |
