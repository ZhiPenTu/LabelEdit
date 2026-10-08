import { useCallback, useEffect, useRef, useState } from 'react';
import { isTauri } from '@tauri-apps/api/core';
import type { Update } from '@tauri-apps/plugin-updater';

export function useAppUpdater() {
  const [update, setUpdate] = useState<Update | null>(null);
  const [visible, setVisible] = useState(false);
  const [status, setStatus] = useState<'idle' | 'checking' | 'downloading' | 'upToDate' | 'error'>('idle');
  const [progress, setProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const mounted = useRef(false);
  const working = useRef(false);
  const updateRef = useRef<Update | null>(null);
  const available = isTauri();
  const performCheck = useCallback(async (silent = false) => {
    if (!isTauri() || working.current) return;
    working.current = true;
    if (!silent) { setStatus('checking'); setVisible(true); }
    try {
      const { check } = await import('@tauri-apps/plugin-updater');
      const found = await check();
      if (!mounted.current) { await found?.close(); return; }
      if (updateRef.current) await updateRef.current.close();
      updateRef.current = found;
      setUpdate(found);
      if (found) { setStatus('idle'); setVisible(true); }
      else if (!silent) setStatus('upToDate');
    } catch (error) {
      if (!silent && mounted.current) {
        const message = error instanceof Error ? error.message : String(error ?? '');
        setStatus(/was not found in the response|targets?notfound/i.test(message) ? 'upToDate' : 'error');
        setErrorMessage(/fetch|dns|network|timeout/i.test(message) ? '检查更新失败，请确认网络连接。' : message || '检查更新失败，请重试。');
      }
    } finally { working.current = false; }
  }, []);
  useEffect(() => {
    mounted.current = true;
    const timer = available ? setTimeout(() => { void performCheck(true); }, 3000) : undefined;
    return () => { mounted.current = false; clearTimeout(timer); void updateRef.current?.close().catch(() => {}); updateRef.current = null; };
  }, [available, performCheck]);
  async function install() {
    if (!updateRef.current || working.current) return;
    working.current = true;
    setStatus('downloading'); setProgress(0); setErrorMessage(null);
    try {
      let downloaded = 0, total = 0;
      await updateRef.current.downloadAndInstall(event => {
        if (!mounted.current) return;
        if (event.event === 'Started') total = event.data.contentLength || 0;
        if (event.event === 'Progress') { downloaded += event.data.chunkLength; if (total) setProgress(Math.min(100, Math.round(downloaded / total * 100))); }
      });
      const { relaunch } = await import('@tauri-apps/plugin-process');
      await relaunch();
    } catch (error) {
      if (mounted.current) { setStatus('error'); setErrorMessage(error instanceof Error ? error.message : '下载安装更新失败，请重试。'); }
    } finally { working.current = false; }
  }
  return { available, update, visible, setVisible, status, progress, errorMessage, check: () => { void performCheck(false); }, install };
}
export type AppUpdater = ReturnType<typeof useAppUpdater>;
