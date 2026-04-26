import { Router } from 'express';
import prisma from '../lib/prisma.js';
import { redisOk } from '../lib/redis.js';
import authRoutes from '../modules/auth/auth.routes.js';

const router = Router();

// ─── v1 ───────────────────────────────────────────────────────────────────────

router.get('/v1/healthz', async (_req, res) => {
  const [dbOk, redisOkResult] = await Promise.all([
    prisma.$queryRaw`SELECT 1`.then(() => true).catch(() => false),
    redisOk(),
  ]);

  const status = dbOk && redisOkResult ? 'ok' : 'degraded';
  const httpStatus = status === 'ok' ? 200 : 503;

  return res.status(httpStatus).json({
    data: {
      status,
      time: new Date().toISOString(),
      dbOk,
      redisOk: redisOkResult,
    },
    meta: {},
    error: null,
  });
});

// ─── Auth ─────────────────────────────────────────────────────────────────────

router.use('/auth', authRoutes);

export default router;
