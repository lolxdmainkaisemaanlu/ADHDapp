import cors from 'cors';
import dotenv from 'dotenv';
import express, { NextFunction, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import type {
  ApiError,
  AuthRequest,
  AuthResponse,
  AuthTokens,
  HealthStatus,
  RefreshRequest,
  SyncPayload,
  SyncResult,
  TaskItem,
  TimerEntry,
  UserProfile
} from '@shared/types';

dotenv.config();

const app = express();
const port = Number(process.env.PORT) || 4000;
const clientOrigin = process.env.CLIENT_ORIGIN || 'http://localhost:5173';
const rateLimitWindowMs = Number(process.env.RATE_LIMIT_WINDOW_MS) || 60_000;
const rateLimitMax = Number(process.env.RATE_LIMIT_MAX) || 100;
const jwtSecret = process.env.JWT_SECRET || 'dev-secret';
const accessTtlSeconds = Number(process.env.ACCESS_TOKEN_TTL) || 60 * 15;
const refreshTtlSeconds = Number(process.env.REFRESH_TOKEN_TTL) || 60 * 60 * 24 * 7;

interface StoredUser extends UserProfile {
  passwordHash: string;
  refreshTokens: Set<string>;
  tasks: TaskItem[];
  timers: TimerEntry[];
}

const usersByEmail = new Map<string, StoredUser>();
const usersById = new Map<string, StoredUser>();

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

const buildProfile = (user: StoredUser): UserProfile => ({
  id: user.id,
  email: user.email,
  displayName: user.displayName,
  currentStreak: user.currentStreak,
  longestStreak: user.longestStreak,
  lastCheckIn: user.lastCheckIn
});

const signToken = (userId: string, type: 'access' | 'refresh', expiresInSeconds: number) => {
  return jwt.sign({ sub: userId, type }, jwtSecret, { expiresIn: expiresInSeconds });
};

const issueTokens = (userId: string): AuthTokens => {
  const issuedAt = new Date();
  const accessToken = signToken(userId, 'access', accessTtlSeconds);
  const refreshToken = signToken(userId, 'refresh', refreshTtlSeconds);

  const tokens: AuthTokens = {
    accessToken,
    refreshToken,
    expiresIn: accessTtlSeconds,
    issuedAt: issuedAt.toISOString()
  };

  const user = usersById.get(userId);
  if (user) {
    user.refreshTokens.add(refreshToken);
  }

  return tokens;
};

const updateStreak = (user: StoredUser) => {
  const today = new Date().toISOString().slice(0, 10);
  const lastCheckIn = user.lastCheckIn.slice(0, 10);

  if (today === lastCheckIn) return;

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().slice(0, 10);

  if (lastCheckIn === yesterdayStr) {
    user.currentStreak += 1;
  } else {
    user.currentStreak = 1;
  }

  user.longestStreak = Math.max(user.longestStreak, user.currentStreak);
  user.lastCheckIn = new Date().toISOString();
};

const mergeById = <T extends { id: string; updatedAt?: string; startedAt?: string; completedAt?: string }>(
  existing: T[],
  incoming: T[]
) => {
  const merged = new Map<string, T>();

  for (const item of existing) {
    merged.set(item.id, item);
  }

  for (const item of incoming) {
    const prior = merged.get(item.id);
    if (!prior) {
      merged.set(item.id, item);
      continue;
    }

    const priorDate = prior.updatedAt ?? prior.completedAt ?? prior.startedAt ?? '';
    const itemDate = item.updatedAt ?? item.completedAt ?? item.startedAt ?? '';

    if (!priorDate || itemDate > priorDate) {
      merged.set(item.id, item);
    }
  }

  return Array.from(merged.values());
};

const authenticate = (req: Request, _res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return next();
  }

  const token = authHeader.replace('Bearer ', '');

  try {
    const payload = jwt.verify(token, jwtSecret) as jwt.JwtPayload;
    if (payload.type !== 'access' || typeof payload.sub !== 'string') {
      return next();
    }

    const user = usersById.get(payload.sub);
    if (user) {
      (req as Request & { user?: StoredUser }).user = user;
    }
  } catch (error) {
    console.warn('Access token verification failed', error);
  }

  next();
};

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

app.post('/auth/register', async (req: Request<unknown, unknown, AuthRequest>, res: Response<AuthResponse | ApiError>) => {
  const { email, password, displayName } = req.body;

  if (!email || !password || !displayName) {
    return res.status(400).json({ message: 'Email, password, and display name are required.' });
  }

  if (usersByEmail.has(email)) {
    return res.status(409).json({ message: 'A user with that email already exists.' });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const now = new Date().toISOString();
  const user: StoredUser = {
    id: randomUUID(),
    email,
    displayName,
    currentStreak: 1,
    longestStreak: 1,
    lastCheckIn: now,
    passwordHash,
    refreshTokens: new Set<string>(),
    tasks: [],
    timers: []
  };

  usersByEmail.set(email, user);
  usersById.set(user.id, user);

  const tokens = issueTokens(user.id);
  const payload: AuthResponse = { user: buildProfile(user), tokens, message: 'Registration successful' };

  res.status(201).json(payload);
});

app.post('/auth/login', async (req: Request<unknown, unknown, AuthRequest>, res: Response<AuthResponse | ApiError>) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required.' });
  }

  const user = usersByEmail.get(email);
  if (!user) {
    return res.status(401).json({ message: 'Invalid credentials.' });
  }

  const isValid = await bcrypt.compare(password, user.passwordHash);
  if (!isValid) {
    return res.status(401).json({ message: 'Invalid credentials.' });
  }

  updateStreak(user);

  const tokens = issueTokens(user.id);
  const payload: AuthResponse = {
    user: buildProfile(user),
    tokens,
    message: 'Login successful'
  };

  res.status(200).json(payload);
});

app.post(
  '/auth/refresh',
  (req: Request<unknown, unknown, RefreshRequest>, res: Response<AuthResponse | ApiError>) => {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({ message: 'Refresh token is required.' });
    }

    try {
      const payload = jwt.verify(refreshToken, jwtSecret) as jwt.JwtPayload;
      if (payload.type !== 'refresh' || typeof payload.sub !== 'string') {
        return res.status(401).json({ message: 'Invalid refresh token.' });
      }

      const user = usersById.get(payload.sub);
      if (!user || !user.refreshTokens.has(refreshToken)) {
        return res.status(401).json({ message: 'Refresh token not recognized.' });
      }

      user.refreshTokens.delete(refreshToken);
      const tokens = issueTokens(user.id);
      const response: AuthResponse = { user: buildProfile(user), tokens, message: 'Tokens refreshed' };

      return res.status(200).json(response);
    } catch (error) {
      return res.status(401).json({ message: 'Unable to refresh token.', details: (error as Error).message });
    }
  }
);

app.post(
  '/sync',
  authenticate,
  (req: Request<unknown, unknown, SyncPayload>, res: Response<SyncResult | ApiError>) => {
    const { tasks = [], timers = [] } = req.body ?? {};
    const authUser = (req as Request & { user?: StoredUser }).user;

    const safeTasks: TaskItem[] = tasks.map((task) => ({
      ...task,
      updatedAt: task.updatedAt ?? new Date().toISOString()
    }));

    const safeTimers: TimerEntry[] = timers.map((timer) => ({
      ...timer,
      startedAt: timer.startedAt ?? new Date().toISOString()
    }));

    let mergedTasks = safeTasks;
    let mergedTimers = safeTimers;
    let message = 'Synced locally (no authenticated user)';

    if (authUser) {
      mergedTasks = mergeById(authUser.tasks, safeTasks);
      mergedTimers = mergeById(authUser.timers, safeTimers);

      authUser.tasks = mergedTasks;
      authUser.timers = mergedTimers;
      message = 'Synced with profile';
    }

    const payload: SyncResult = {
      tasks: mergedTasks,
      timers: mergedTimers,
      lastSyncedAt: new Date().toISOString(),
      message
    };

    res.status(200).json(payload);
  }
);

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
