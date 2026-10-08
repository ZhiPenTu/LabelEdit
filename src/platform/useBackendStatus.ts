import { useEffect, useState } from 'react';
import { checkBackendHealth } from './backend';

export function useBackendStatus() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const deadline = Date.now() + 30_000;
    async function probe() {
      const status = await checkBackendHealth();
      if (!active) return;
      if (status.ready) setReady(true);
      else if (Date.now() >= deadline) setError(status.error || '本地后端启动超时，请重试。');
      else timer = setTimeout(probe, 500);
    }
    void probe();
    return () => { active = false; clearTimeout(timer); };
  }, [attempt]);
  return { ready, error, retry: () => { setError(null); setReady(false); setAttempt(value => value + 1); } };
}
