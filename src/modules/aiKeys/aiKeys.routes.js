import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { asyncHandler } from '../../lib/asyncHandler.js';
import { upsertAiKeysSchema } from './aiKeys.schemas.js';
import * as aiKeysController from './aiKeys.controller.js';

const router = Router();

router.use(requireAuth);

router.get('/', asyncHandler(aiKeysController.getAiKeys));
router.put('/', validate(upsertAiKeysSchema), asyncHandler(aiKeysController.upsertAiKeys));

export default router;
