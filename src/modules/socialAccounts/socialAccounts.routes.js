import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { asyncHandler } from '../../lib/asyncHandler.js';
import { createSocialAccountSchema } from './socialAccounts.schemas.js';
import * as socialAccountsController from './socialAccounts.controller.js';

const router = Router();

router.use(requireAuth);

router.get('/', asyncHandler(socialAccountsController.listAccounts));
router.post('/', validate(createSocialAccountSchema), asyncHandler(socialAccountsController.createAccount));
router.delete('/:id', asyncHandler(socialAccountsController.deleteAccount));

export default router;
