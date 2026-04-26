import { z } from 'zod';

export const generateContentSchema = z.object({
  idea: z.string().min(1).max(500),
  post_type: z.enum(['announcement', 'thread', 'story', 'promotional', 'educational', 'opinion']),
  platforms: z
    .array(z.enum(['twitter', 'linkedin', 'instagram', 'threads']))
    .min(1)
    .max(4)
    .refine((arr) => new Set(arr).size === arr.length, {
      message: 'platforms must contain unique values',
    }),
  tone: z.enum(['professional', 'casual', 'witty', 'authoritative', 'friendly']),
  language: z
    .string()
    .regex(/^[a-z]{2}$/, 'language must be a two-letter ISO 639-1 code (e.g. "en")')
    .default('en'),
  model: z.enum(['openai', 'anthropic']),
});
