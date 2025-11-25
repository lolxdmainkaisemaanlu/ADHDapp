import type { AuthTokens, SyncResult, TaskItem, TimerEntry } from '@shared/types';
import { loadTasksFromCache, loadTimersFromCache, saveTasksToCache, saveTimersToCache } from './storage';

const API_BASE = 'http://localhost:4000';

export class SyncService {
  private tokens?: AuthTokens;
  private lastResult: SyncResult | null = null;
  private syncing = false;

  setTokens(tokens?: AuthTokens) {
    this.tokens = tokens;
  }

  async hydrateFromCache(): Promise<{ tasks: TaskItem[]; timers: TimerEntry[]; lastSyncedAt?: string }> {
    const [tasks, timers] = await Promise.all([Promise.resolve(loadTasksFromCache()), loadTimersFromCache()]);
    return { tasks, timers, lastSyncedAt: this.lastResult?.lastSyncedAt };
  }

  async sync(tasks: TaskItem[], timers: TimerEntry[]): Promise<SyncResult | null> {
    await saveTasksToCache(tasks);
    await saveTimersToCache(timers);

    if (!navigator.onLine || this.syncing) {
      return null;
    }

    this.syncing = true;
    try {
      const response = await fetch(`${API_BASE}/sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.tokens?.accessToken ? { Authorization: `Bearer ${this.tokens.accessToken}` } : {})
        },
        body: JSON.stringify({ tasks, timers })
      });

      if (!response.ok) {
        return null;
      }

      const payload = (await response.json()) as SyncResult;
      this.lastResult = payload;
      await saveTasksToCache(payload.tasks);
      await saveTimersToCache(payload.timers);
      return payload;
    } catch (error) {
      console.warn('Sync failed, will retry later', error);
      return null;
    } finally {
      this.syncing = false;
    }
  }
}
