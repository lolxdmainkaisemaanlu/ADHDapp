import { useEffect, useState } from 'react';
import type { HealthStatus, ClientInfo } from '@shared/types';

const clientInfo: ClientInfo = {
  name: 'ADHD App Client',
  version: '1.0.0'
};

function App() {
  const [health, setHealth] = useState<HealthStatus | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    fetch('http://localhost:4000/health', { signal: controller.signal })
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

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-slate-900 px-6 py-10 text-slate-100">
      <section className="space-y-3 text-center">
        <p className="text-sm uppercase tracking-[0.2em] text-slate-400">{clientInfo.name}</p>
        <h1 className="text-3xl font-semibold">Starter Vite + Tailwind React App</h1>
        <p className="text-slate-300">Version {clientInfo.version}</p>
      </section>

      <section className="w-full max-w-xl rounded-xl border border-slate-800 bg-slate-950/60 p-6 shadow-lg shadow-slate-900">
        <h2 className="mb-2 text-left text-xl font-semibold">Server Health</h2>
        {health ? (
          <div className="space-y-1 text-left">
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
            {health.message && (
              <p className="text-slate-300">{health.message}</p>
            )}
          </div>
        ) : (
          <p className="text-slate-400">Checking server health...</p>
        )}
      </section>
    </main>
  );
}

export default App;
