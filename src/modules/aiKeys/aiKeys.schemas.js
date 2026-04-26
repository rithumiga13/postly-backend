import { z } from 'zod';

export const upsertAiKeysSchema = z
  .object({
    openaiKey: z.string().min(1).optional(),
    anthropicKey: z.string().min(1).optional(),
  })
  .refine((data) => data.openaiKey !== undefined || data.anthropicKey !== undefined, {
    message: 'At least one of openaiKey or anthropicKey must be provided',
  });
