import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { asyncHandler } from '../../lib/asyncHandler.js';
import * as dashboardController from './dashboard.controller.js';

const router = Router();

router.use(requireAuth);

router.get('/stats', asyncHandler(dashboardController.stats));

export default router;
