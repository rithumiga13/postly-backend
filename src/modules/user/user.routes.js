import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { asyncHandler } from '../../lib/asyncHandler.js';
import { updateProfileSchema } from './user.schemas.js';
import * as userController from './user.controller.js';

const router = Router();

router.use(requireAuth);

router.get('/profile', asyncHandler(userController.getProfile));
router.put('/profile', validate(updateProfileSchema), asyncHandler(userController.updateProfile));

export default router;
