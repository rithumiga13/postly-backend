# Architecture

> Stub — to be expanded as phases are completed.

## Layers

```
routes → controllers → services → repositories (Prisma)
```

- **Routes**: Express routers. Attach middleware and delegate to controllers.
- **Controllers**: Parse/validate input, call services, format the response envelope.
- **Services**: Business logic. No Express types, no direct DB calls.
- **Repositories**: All Prisma queries. Return plain objects.

## Response envelope

Every response follows `{ data, meta, error }`. `data` is `null` on error; `error` is `null` on success.

## Secrets at rest

Social account tokens and API keys are encrypted with AES-256-GCM before being written to the database. Each record stores `iv:authTag:ciphertext` (all base64). The key is read from `ENCRYPTION_KEY` at startup.
