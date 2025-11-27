export interface HealthStatus {
  status: 'ok' | 'error';
  uptime: number;
  timestamp: string;
  message?: string;
}

export interface ApiError {
  message: string;
  details?: string;
}

export interface ClientInfo {
  name: string;
  version: string;
}

export interface UserProfile {
  id: string;
  email: string;
  displayName: string;
  currentStreak: number;
  longestStreak: number;
  lastCheckIn: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  issuedAt: string;
}

export interface AuthResponse {
  user: UserProfile;
  tokens: AuthTokens;
  message?: string;
}

export interface AuthRequest {
  email: string;
  password: string;
  displayName?: string;
}

export interface RefreshRequest {
  refreshToken: string;
}

export interface TaskItem {
  id: string;
  title: string;
  completed: boolean;
  updatedAt: string;
}

export type SessionCategory = 'focus' | 'short-break' | 'long-break';
export type SessionStatus = 'completed' | 'cancelled';

export interface TimerEntry {
  id: string;
  taskId?: string;
  durationMs: number;
  startedAt: string;
  completedAt?: string;
  category?: SessionCategory;
  status?: SessionStatus;
  label?: string;
}

export interface SyncPayload {
  tasks: TaskItem[];
  timers: TimerEntry[];
}

export interface SyncResult {
  tasks: TaskItem[];
  timers: TimerEntry[];
  lastSyncedAt: string;
  message?: string;
}
