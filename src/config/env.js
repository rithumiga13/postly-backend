import "dotenv/config";
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),

  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),

  // Must be a 32-byte value expressed as 64 hex characters.
  ENCRYPTION_KEY: z.string().regex(/^[0-9a-fA-F]{64}$/, 'ENCRYPTION_KEY must be 64 hex chars (32 bytes)'),

  JWT_SECRET: z.string().min(16),
  JWT_EXPIRES_IN: z.string().default('7d'),

  TELEGRAM_BOT_TOKEN: z.string().optional(),
  BOT_MODE: z.enum(['polling', 'webhook']).default('polling'),
  TELEGRAM_WEBHOOK_SECRET: z.string().optional(),
  PUBLIC_URL: z.string().url().optional(),

  OPENAI_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),

  // Model names — override in production to use more capable models.
  OPENAI_MODEL: z.string().default('gpt-4o-mini'),
  ANTHROPIC_MODEL: z.string().default('claude-haiku-4-5'),

  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),

  TWITTER_API_KEY: z.string().optional(),
  TWITTER_API_SECRET: z.string().optional(),

  WORKER_INLINE: z.string().transform((v) => v !== 'false').default('true'),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((i) => `  ${i.path.join('.')}: ${i.message}`)
    .join('\n');
  // Intentional process exit — missing env is unrecoverable at startup.
  process.stderr.write(`Invalid environment variables:\n${issues}\n`);
  process.exit(1);
}

export const env = parsed.data;
