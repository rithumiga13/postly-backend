import express from 'express';
import { errorHandler } from './middleware/error.js';
import { defaultRateLimit } from './middleware/rateLimit.js';
import router from './routes/index.js';

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(defaultRateLimit);

app.use('/api', router);

// 404 — must come after all routes.
app.use((_req, res) => {
  res.status(404).json({
    data: null,
    meta: {},
    error: { code: 'NOT_FOUND', message: 'Route not found' },
  });
});

app.use(errorHandler);

export default app;
