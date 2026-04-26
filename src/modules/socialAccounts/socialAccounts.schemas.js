import { z } from 'zod';

export const createSocialAccountSchema = z.object({
  platform: z.enum(['twitter', 'linkedin', 'instagram', 'threads']),
  handle: z.string().min(1).optional(),
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1).optional(),
  expiresAt: z.string().datetime().optional(),
});
