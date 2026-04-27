import { z } from 'zod';

const PLATFORMS = ['twitter', 'linkedin', 'instagram', 'threads'];
const POST_TYPES = ['announcement', 'thread', 'story', 'promotional', 'educational', 'opinion'];
const TONES = ['professional', 'casual', 'witty', 'authoritative', 'friendly'];
const STATUSES = ['queued', 'processing', 'published', 'failed', 'cancelled'];

const platformContentSchema = z.object({
  content: z.string().min(1),
  char_count: z.number().int().nonnegative(),
  hashtags: z.array(z.string()),
});

const basePublishSchema = z.object({
  idea: z.string().min(1).max(500),
  generated: z
    .record(z.enum(PLATFORMS), platformContentSchema)
    .refine((v) => Object.keys(v).length >= 1, { message: 'At least one platform required' }),
  postType: z.enum(POST_TYPES),
  tone: z.enum(TONES),
  language: z.string().min(2).max(10),
  modelUsed: z.string().min(1),
});

export const publishSchema = basePublishSchema;

export const scheduleSchema = basePublishSchema.extend({
  publishAt: z
    .string()
    .datetime()
    .refine((v) => new Date(v) > new Date(), { message: 'publishAt must be a future date' }),
});

export const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
  status: z.enum(STATUSES).optional(),
  platform: z.enum(PLATFORMS).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});
