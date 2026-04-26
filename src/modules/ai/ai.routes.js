import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { asyncHandler } from '../../lib/asyncHandler.js';
import { generateContentSchema } from './ai.schemas.js';
import * as aiController from './ai.controller.js';

const router = Router();

router.use(requireAuth);

router.post('/generate', validate(generateContentSchema), asyncHandler(aiController.generateContent));

export default router;
