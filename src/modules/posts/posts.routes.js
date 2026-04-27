import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { asyncHandler } from '../../lib/asyncHandler.js';
import { publishSchema, scheduleSchema, listQuerySchema } from './posts.schemas.js';
import * as ctrl from './posts.controller.js';

const router = Router();

router.use(requireAuth);

router.post('/publish', validate(publishSchema), asyncHandler(ctrl.publish));
router.post('/schedule', validate(scheduleSchema), asyncHandler(ctrl.schedule));
router.get('/', validate(listQuerySchema, 'query'), asyncHandler(ctrl.list));
router.get('/:id', asyncHandler(ctrl.getOne));
router.post('/:id/retry', asyncHandler(ctrl.retry));
router.delete('/:id', asyncHandler(ctrl.remove));

export default router;
