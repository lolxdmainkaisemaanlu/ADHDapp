import { useEffect, useMemo, useState } from 'react';
import type {
  AuthRequest,
  AuthResponse,
  AuthTokens,
  ClientInfo,
  HealthStatus,
  TaskItem,
  TimerEntry
} from '@shared/types';
import { loadOfflinePreference, saveOfflinePreference } from './storage';
import { SyncService } from './syncService';

const clientInfo: ClientInfo = {
  name: 'ADHD App Client',
  version: '1.1.0'
};

const API_BASE = 'http://localhost:4000';

const buildId = () => {
  if (crypto.randomUUID) {
    return crypto.randomUUID();
  }

  return `local-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

function App() {
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [auth, setAuth] = useState<AuthResponse | null>(null);
  const [authMessage, setAuthMessage] = useState<string>('');
  const [offlineMode, setOfflineMode] = useState<boolean>(loadOfflinePreference() || !navigator.onLine);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [timers, setTimers] = useState<TimerEntry[]>([]);
  const [syncNote, setSyncNote] = useState<string>('Not synced yet');
  const [taskTitle, setTaskTitle] = useState('');
  const [timerMinutes, setTimerMinutes] = useState(25);
  const [form, setForm] = useState<AuthRequest>({ email: '', password: '', displayName: '' });

  const syncService = useMemo(() => new SyncService(), []);

  useEffect(() => {
    const controller = new AbortController();

    fetch(`${API_BASE}/health`, { signal: controller.signal })
      .then(async (response) => {
        const payload = (await response.json()) as HealthStatus;
        setHealth(payload);
      })
      .catch(() => {
        setHealth({
          status: 'error',
          uptime: 0,
          timestamp: new Date().toISOString(),
          message: 'Unable to reach server'
        });
      });

    return () => controller.abort();
  }, []);

  useEffect(() => {
    syncService.setTokens(auth?.tokens);
  }, [auth, syncService]);

  useEffect(() => {
    const hydrate = async () => {
      const payload = await syncService.hydrateFromCache();
      setTasks(payload.tasks);
      setTimers(payload.timers);
      if (payload.lastSyncedAt) {
        setSyncNote(`Last synced at ${new Date(payload.lastSyncedAt).toLocaleTimeString()}`);
      }
    };

    void hydrate();
  }, [syncService]);

  useEffect(() => {
    const handleOnline = () => {
      setOfflineMode(false);
      saveOfflinePreference(false);
      void syncService.sync(tasks, timers).then((result) => {
        if (result) {
          setTasks(result.tasks);
          setTimers(result.timers);
          setSyncNote(`${result.message} • ${new Date(result.lastSyncedAt).toLocaleTimeString()}`);
        }
      });
    };

    const handleOffline = () => {
      setOfflineMode(true);
      saveOfflinePreference(true);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [syncService, tasks, timers]);

  const persistAndSync = async (nextTasks: TaskItem[], nextTimers: TimerEntry[]) => {
    setTasks(nextTasks);
    setTimers(nextTimers);

    const result = await syncService.sync(nextTasks, nextTimers);
    if (result) {
      setTasks(result.tasks);
      setTimers(result.timers);
      setSyncNote(`${result.message} • ${new Date(result.lastSyncedAt).toLocaleTimeString()}`);
    }
  };

  const handleAuth = async (path: 'register' | 'login', payload: AuthRequest) => {
    setAuthMessage('');
    try {
      const response = await fetch(`${API_BASE}/auth/${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errorText = await response.text();
        setAuthMessage(errorText || 'Authentication failed');
        return;
      }

      const body = (await response.json()) as AuthResponse;
      setAuth(body);
      setOfflineMode(false);
      saveOfflinePreference(false);
      setAuthMessage(body.message ?? `${path} success`);

      await persistAndSync(tasks, timers);
    } catch (error) {
      setAuthMessage((error as Error).message);
    }
  };

  const handleRefresh = async (tokens: AuthTokens | undefined) => {
    if (!tokens) return;

    try {
      const response = await fetch(`${API_BASE}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: tokens.refreshToken })
      });

      if (response.ok) {
        const body = (await response.json()) as AuthResponse;
        setAuth(body);
        setAuthMessage(body.message ?? 'Tokens refreshed');
      }
    } catch (error) {
      setAuthMessage((error as Error).message);
    }
  };

  const addTask = () => {
    if (!taskTitle.trim()) return;

    const now = new Date().toISOString();
    const nextTasks: TaskItem[] = [
      { id: buildId(), title: taskTitle.trim(), completed: false, updatedAt: now },
      ...tasks
    ];

    setTaskTitle('');
    void persistAndSync(nextTasks, timers);
  };

  const toggleTask = (id: string) => {
    const now = new Date().toISOString();
    const nextTasks = tasks.map((task) =>
      task.id === id ? { ...task, completed: !task.completed, updatedAt: now } : task
    );

    void persistAndSync(nextTasks, timers);
  };

  const addTimerEntry = () => {
    const durationMs = Math.max(1, timerMinutes) * 60 * 1000;
    const now = new Date().toISOString();
    const nextTimers: TimerEntry[] = [
      {
        id: buildId(),
        durationMs,
        startedAt: now,
        completedAt: new Date(Date.now() + durationMs).toISOString()
      },
      ...timers
    ];

    void persistAndSync(tasks, nextTimers);
  };

  const continueOffline = () => {
    setOfflineMode(true);
    setAuth(null);
    setAuthMessage('You are working offline. Create an account anytime to sync.');
    saveOfflinePreference(true);
  };

  const offlineBadge = (
    <span className="rounded-full bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-300">
      Offline cache enabled
    </span>
  );

  return (
    <main className="flex min-h-screen flex-col gap-8 bg-slate-900 px-6 py-10 text-slate-100">
      <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm uppercase tracking-[0.2em] text-slate-400">{clientInfo.name}</p>
          <h1 className="text-3xl font-semibold">Focus & Habits Control Panel</h1>
          <p className="text-slate-300">Version {clientInfo.version}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!navigator.onLine && offlineBadge}
          {offlineMode && navigator.onLine && offlineBadge}
          {auth?.user ? (
            <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-300">
              Signed in as {auth.user.displayName}
            </span>
          ) : (
            <button
              type="button"
              className="rounded-full bg-indigo-500 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-indigo-500/30 transition hover:bg-indigo-400"
              onClick={continueOffline}
            >
              Continue offline
            </button>
          )}
        </div>
      </header>

      <section className="grid grid-cols-1 gap-6 lg:grid-cols-[2fr_1.1fr]">
        <div className="space-y-6 rounded-xl border border-slate-800 bg-slate-950/60 p-6 shadow-lg shadow-slate-900">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">Your plan</h2>
            <p className="text-xs text-slate-400">{syncNote}</p>
          </div>

          <div className="flex flex-col gap-4 md:flex-row md:items-end">
            <div className="flex-1">
              <label className="text-sm text-slate-300" htmlFor="taskTitle">
                Add a quick task
              </label>
              <input
                id="taskTitle"
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm text-slate-100 outline-none focus:border-indigo-400"
                value={taskTitle}
                onChange={(event) => setTaskTitle(event.target.value)}
                placeholder="Prepare focus playlist"
              />
            </div>
            <button
              type="button"
              onClick={addTask}
              className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-indigo-500/30 transition hover:bg-indigo-400"
            >
              Save task
            </button>
          </div>

          <ul className="space-y-2">
            {tasks.length === 0 && <li className="text-sm text-slate-400">No tasks yet. Add one to get started.</li>}
            {tasks.map((task) => (
              <li
                key={task.id}
                className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-900/80 px-4 py-3"
              >
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={task.completed}
                    onChange={() => toggleTask(task.id)}
                    className="h-4 w-4 rounded border-slate-600 bg-slate-800"
                  />
                  <div>
                    <p className={`text-sm ${task.completed ? 'text-slate-400 line-through' : 'text-slate-100'}`}>
                      {task.title}
                    </p>
                    <p className="text-xs text-slate-500">Updated {new Date(task.updatedAt).toLocaleString()}</p>
                  </div>
                </div>
              </li>
            ))}
          </ul>

          <div className="rounded-lg border border-slate-800 bg-slate-900/80 px-4 py-3">
            <div className="flex flex-col gap-2 md:flex-row md:items-end md:gap-4">
              <div className="flex-1">
                <label className="text-sm text-slate-300" htmlFor="timerMinutes">
                  Log a focus timer (minutes)
                </label>
                <input
                  id="timerMinutes"
                  type="number"
                  min={1}
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm text-slate-100 outline-none focus:border-indigo-400"
                  value={timerMinutes}
                  onChange={(event) => setTimerMinutes(Number(event.target.value))}
                />
              </div>
              <button
                type="button"
                onClick={addTimerEntry}
                className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-emerald-950 shadow-lg shadow-emerald-500/30 transition hover:bg-emerald-400"
              >
                Add timer entry
              </button>
            </div>

            <div className="mt-3 space-y-2">
              {timers.length === 0 && (
                <p className="text-sm text-slate-400">Timers are saved in IndexedDB so you can track focus time offline.</p>
              )}
              {timers.slice(0, 4).map((timer) => (
                <div key={timer.id} className="rounded-md bg-slate-800/80 px-3 py-2 text-sm">
                  <p className="text-slate-100">Session: {(timer.durationMs / 60000).toFixed(0)} min</p>
                  <p className="text-xs text-slate-400">
                    Started {new Date(timer.startedAt).toLocaleString()} • Ends {timer.completedAt && new Date(timer.completedAt).toLocaleTimeString()}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <section className="rounded-xl border border-slate-800 bg-slate-950/60 p-6 shadow-lg shadow-slate-900">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold">Account</h2>
              {offlineMode && <span className="text-xs text-slate-400">Create later if you prefer</span>}
            </div>

            <div className="space-y-3 text-sm">
              <p className="text-slate-300">
                Sync tasks and streaks when you are ready. You can start offline now and register whenever it suits you.
              </p>
              {auth?.user && (
                <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3 text-sm">
                  <p className="font-semibold text-slate-100">{auth.user.displayName}</p>
                  <p className="text-slate-300">{auth.user.email}</p>
                  <p className="text-xs text-slate-400">
                    Streak: {auth.user.currentStreak} day(s) • Longest: {auth.user.longestStreak}
                  </p>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 gap-3">
              <input
                className="w-full rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm text-slate-100 outline-none focus:border-indigo-400"
                placeholder="Email"
                value={form.email}
                onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
              />
              <input
                className="w-full rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm text-slate-100 outline-none focus:border-indigo-400"
                type="password"
                placeholder="Password"
                value={form.password}
                onChange={(event) => setForm((prev) => ({ ...prev, password: event.target.value }))}
              />
              <input
                className="w-full rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm text-slate-100 outline-none focus:border-indigo-400"
                placeholder="Display name"
                value={form.displayName ?? ''}
                onChange={(event) => setForm((prev) => ({ ...prev, displayName: event.target.value }))}
              />

              <div className="flex flex-wrap gap-2 text-sm">
                <button
                  type="button"
                  className="flex-1 rounded-lg bg-indigo-500 px-4 py-2 font-semibold text-white shadow-lg shadow-indigo-500/30 transition hover:bg-indigo-400"
                  onClick={() => handleAuth('register', form)}
                  disabled={offlineMode}
                >
                  Create account
                </button>
                <button
                  type="button"
                  className="flex-1 rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 font-semibold text-slate-100 transition hover:border-indigo-400"
                  onClick={() => handleAuth('login', form)}
                  disabled={offlineMode}
                >
                  Login
                </button>
              </div>

              {auth?.tokens && (
                <button
                  type="button"
                  className="w-full rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-emerald-950 shadow-lg shadow-emerald-500/30 transition hover:bg-emerald-400"
                  onClick={() => handleRefresh(auth.tokens)}
                >
                  Refresh session
                </button>
              )}

              <p className="text-xs text-amber-300">{offlineMode ? 'Offline mode: data will sync when you create an account and go online.' : authMessage}</p>
            </div>
          </section>

          <section className="rounded-xl border border-slate-800 bg-slate-950/60 p-6 shadow-lg shadow-slate-900">
            <h2 className="text-xl font-semibold">Server Health</h2>
            {health ? (
              <div className="mt-2 space-y-1 text-sm">
                <p>
                  <span className="font-medium text-slate-200">Status:</span>{' '}
                  <span className={health.status === 'ok' ? 'text-emerald-400' : 'text-rose-400'}>
                    {health.status.toUpperCase()}
                  </span>
                </p>
                <p>
                  <span className="font-medium text-slate-200">Uptime:</span> {health.uptime.toFixed(0)}s
                </p>
                <p>
                  <span className="font-medium text-slate-200">Timestamp:</span> {health.timestamp}
                </p>
                {health.message && <p className="text-slate-300">{health.message}</p>}
              </div>
            ) : (
              <p className="text-slate-400">Checking server health...</p>
            )}
          </section>
        </div>
      </section>
    </main>
  );
}

export default App;
