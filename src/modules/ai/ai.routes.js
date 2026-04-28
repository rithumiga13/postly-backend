import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { asyncHandler } from '../../lib/asyncHandler.js';
import { rateLimit } from '../../middleware/rateLimit.js';
import { env } from '../../config/env.js';
import { generateContentSchema } from './ai.schemas.js';
import * as aiController from './ai.controller.js';

const router = Router();

router.use(requireAuth);

const passThrough = (_req, _res, next) => next();
const generateLimiter =
  env.NODE_ENV === 'test'
    ? passThrough
    : rateLimit({ windowSeconds: 60, max: 10, keyBy: 'user', prefix: 'rl:generate' });

router.post('/generate', generateLimiter, validate(generateContentSchema), asyncHandler(aiController.generateContent));

export default router;
