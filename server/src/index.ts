import cors from 'cors';
import dotenv from 'dotenv';
import express, { Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import type { ApiError, HealthStatus } from '@shared/types';

dotenv.config();

const app = express();
const port = Number(process.env.PORT) || 4000;
const clientOrigin = process.env.CLIENT_ORIGIN || 'http://localhost:5173';
const rateLimitWindowMs = Number(process.env.RATE_LIMIT_WINDOW_MS) || 60_000;
const rateLimitMax = Number(process.env.RATE_LIMIT_MAX) || 100;

const limiter = rateLimit({
  windowMs: rateLimitWindowMs,
  max: rateLimitMax,
  standardHeaders: true,
  legacyHeaders: false
});

app.use(limiter);
app.use(helmet());
app.use(
  cors({
    origin: clientOrigin,
    credentials: true
  })
);
app.use(express.json());

app.get('/health', (_req: Request, res: Response<HealthStatus>) => {
  const payload: HealthStatus = {
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    message: 'Service healthy'
  };

  res.status(200).json(payload);
});

app.get('/healthz', (_req: Request, res: Response) => {
  res.status(200).send('ok');
});

app.use((req: Request, res: Response<ApiError>) => {
  res.status(404).json({
    message: 'Route not found',
    details: `${req.method} ${req.path}`
  });
});

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
  console.log(`CORS enabled for: ${clientOrigin}`);
});
