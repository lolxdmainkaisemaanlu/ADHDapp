import type { TaskItem, TimerEntry } from '@shared/types';

const TASKS_KEY = 'adhdapp.tasks';
const OFFLINE_KEY = 'adhdapp.offline-mode';
const TIMER_DB_NAME = 'adhdapp-timers';
const TIMER_STORE = 'timers';

export const saveTasksToCache = (tasks: TaskItem[]) => {
  localStorage.setItem(TASKS_KEY, JSON.stringify(tasks));
};

export const loadTasksFromCache = (): TaskItem[] => {
  const raw = localStorage.getItem(TASKS_KEY);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as TaskItem[];
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn('Unable to parse cached tasks', error);
    return [];
  }
};

export const saveOfflinePreference = (enabled: boolean) => {
  localStorage.setItem(OFFLINE_KEY, String(enabled));
};

export const loadOfflinePreference = (): boolean => {
  const raw = localStorage.getItem(OFFLINE_KEY);
  return raw === 'true';
};

const openTimerDb = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(TIMER_DB_NAME, 1);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(TIMER_STORE)) {
        db.createObjectStore(TIMER_STORE, { keyPath: 'id' });
      }
    };

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
};

const withTimerStore = async <T>(mode: IDBTransactionMode, handler: (store: IDBObjectStore) => Promise<T>): Promise<T> => {
  const db = await openTimerDb();
  const transaction = db.transaction(TIMER_STORE, mode);
  const store = transaction.objectStore(TIMER_STORE);

  try {
    const result = await handler(store);
    await new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve(true);
      transaction.onerror = () => reject(transaction.error);
    });
    return result;
  } finally {
    db.close();
  }
};

export const loadTimersFromCache = async (): Promise<TimerEntry[]> => {
  return withTimerStore('readonly', async (store) => {
    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result as TimerEntry[]);
      request.onerror = () => reject(request.error);
    });
  });
};

export const saveTimersToCache = async (timers: TimerEntry[]): Promise<void> => {
  await withTimerStore('readwrite', async (store) => {
    await new Promise((resolve, reject) => {
      const clearRequest = store.clear();
      clearRequest.onsuccess = () => resolve(true);
      clearRequest.onerror = () => reject(clearRequest.error);
    });

    await Promise.all(
      timers.map(
        (timer) =>
          new Promise((resolve, reject) => {
            const request = store.put(timer);
            request.onsuccess = () => resolve(true);
            request.onerror = () => reject(request.error);
          })
      )
    );
  });
};
