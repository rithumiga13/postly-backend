import { z } from 'zod';

export const updateProfileSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  bio: z.string().max(500).optional(),
  defaultTone: z
    .enum(['professional', 'casual', 'witty', 'authoritative', 'friendly'])
    .optional(),
  defaultLanguage: z.string().min(2).max(10).optional(),
});
