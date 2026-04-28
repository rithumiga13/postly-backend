import { Router } from 'express';
import { validate } from '../../middleware/validate.js';
import { requireAuth } from '../../middleware/auth.js';
import { asyncHandler } from '../../lib/asyncHandler.js';
import { rateLimit } from '../../middleware/rateLimit.js';
import { env } from '../../config/env.js';
import { registerSchema, loginSchema, refreshSchema, logoutSchema } from './auth.schemas.js';
import * as authController from './auth.controller.js';

const router = Router();

// Skip rate limiting in test mode — all supertest requests share 127.0.0.1.
const passThrough = (_req, _res, next) => next();
const authLimiter =
  env.NODE_ENV === 'test'
    ? passThrough
    : rateLimit({ windowSeconds: 60, max: 5, keyBy: 'ip', prefix: 'rl:auth' });

router.post('/register', authLimiter, validate(registerSchema), asyncHandler(authController.register));
router.post('/login', authLimiter, validate(loginSchema), asyncHandler(authController.login));
router.post('/refresh', validate(refreshSchema), asyncHandler(authController.refresh));
router.post('/logout', validate(logoutSchema), asyncHandler(authController.logout));
router.get('/me', requireAuth, asyncHandler(authController.me));

export default router;
