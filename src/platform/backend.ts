import { isTauri, invoke } from '@tauri-apps/api/core';

let cachedBaseUrl: string | null = null;

export async function getApiBase(): Promise<string> {
  if (cachedBaseUrl !== null) return cachedBaseUrl;
  if (isTauri()) {
    try {
      const url = await invoke<string>('get_backend_url');
      cachedBaseUrl = url.replace(/\/+$/, '');
      return cachedBaseUrl;
    } catch {
      cachedBaseUrl = 'http://127.0.0.1:8765';
      return cachedBaseUrl;
    }
  }
  cachedBaseUrl = '';
  return cachedBaseUrl;
}

export function getSyncApiBase(): string {
  if (cachedBaseUrl !== null) return cachedBaseUrl;
  if (isTauri()) return 'http://127.0.0.1:8765';
  return '';
}

export async function checkBackendHealth(): Promise<{ ready: boolean; error?: string }> {
  const base = await getApiBase();
  try {
    const res = await fetch(`${base}/api/health`, { cache: 'no-store', signal: AbortSignal.timeout(3000) });
    if (!res.ok) return { ready: false, error: `服务状态异常（${res.status}）` };
    const data = await res.json();
    return { ready: Boolean(data.ready) };
  } catch (e) {
    return { ready: false, error: e instanceof Error ? e.message : '无法连接到后端服务' };
  }
}

