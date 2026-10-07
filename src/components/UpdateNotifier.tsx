import { useEffect, useState, useCallback } from 'react';
import { isTauri } from '@tauri-apps/api/core';
import { check, type Update } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { DownloadCloud, Sparkles, X, CheckCircle2, AlertCircle, LoaderCircle } from 'lucide-react';

export function UpdateNotifier({ onManualCheckRef }: { onManualCheckRef?: (checkFn: () => void) => void }) {
  const [update, setUpdate] = useState<Update | null>(null);
  const [visible, setVisible] = useState(false);
  const [status, setStatus] = useState<'idle' | 'checking' | 'downloading' | 'upToDate' | 'error'>('idle');
  const [progress, setProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const performCheck = useCallback(async (silent = false) => {
    if (!isTauri()) {
      if (!silent) {
        setStatus('error');
        setErrorMessage('当前为网页模式，桌面客户端支持完整的自动检测与静默升级。');
        setVisible(true);
      }
      return;
    }

    try {
      if (!silent) setStatus('checking');
      const found = await check();
      if (found) {
        setUpdate(found);
        setStatus('idle');
        setVisible(true);
      } else if (!silent) {
        setStatus('upToDate');
        setVisible(true);
      }
    } catch (err) {
      if (!silent) {
        const rawMessage = err instanceof Error ? err.message : (typeof err === 'string' ? err : String(err ?? ''));
        // If the platform/target has no separate update entry in the release manifest,
        // it means there is no newer update package available for the current platform.
        if (
          rawMessage.includes('was not found in the response') ||
          rawMessage.toLowerCase().includes('targetnotfound') ||
          rawMessage.toLowerCase().includes('targetsnotfound')
        ) {
          setStatus('upToDate');
          setVisible(true);
          return;
        }

        setStatus('error');
        setErrorMessage(
          rawMessage.includes('Failed to fetch') ||
          rawMessage.includes('dns') ||
          rawMessage.includes('network') ||
          rawMessage.includes('timeout')
            ? '检查更新失败，请确认网络连接。'
            : (rawMessage || '检查更新失败，请确认网络连接。')
        );
        setVisible(true);
      }
    }
  }, []);

  useEffect(() => {
    if (onManualCheckRef) {
      onManualCheckRef(() => void performCheck(false));
    }
  }, [onManualCheckRef, performCheck]);

  useEffect(() => {
    // Check quietly in the background 3 seconds after launch
    const timer = setTimeout(() => {
      void performCheck(true);
    }, 3000);
    return () => clearTimeout(timer);
  }, [performCheck]);

  async function handleDownloadAndInstall() {
    if (!update) return;
    setStatus('downloading');
    setProgress(0);
    setErrorMessage(null);

    try {
      let downloaded = 0;
      let totalLength = 0;
      await update.downloadAndInstall((event) => {
        if (event.event === 'Started') {
          totalLength = event.data.contentLength || 0;
        } else if (event.event === 'Progress') {
          downloaded += event.data.chunkLength;
          if (totalLength > 0) {
            setProgress(Math.min(100, Math.round((downloaded / totalLength) * 100)));
          }
        }
      });
      await relaunch();
    } catch (err) {
      setStatus('error');
      setErrorMessage(err instanceof Error ? err.message : '下载安装更新失败，请重试。');
    }
  }

  if (!visible) return null;

  return (
    <div className="update-modal-backdrop" role="dialog" aria-modal="true" aria-label="软件更新">
      <div className="update-modal">
        <button className="modal-close" onClick={() => setVisible(false)} aria-label="关闭">
          <X size={18} />
        </button>

        {status === 'checking' && (
          <div className="update-modal-body">
            <LoaderCircle className="spinning text-primary" size={32} />
            <h4>正在检查新版本...</h4>
          </div>
        )}

        {status === 'upToDate' && (
          <div className="update-modal-body">
            <CheckCircle2 className="text-success" size={36} />
            <h4>当前已是最新版本</h4>
            <p>您的 LabelEdit 已是最新发行版，无需更新。</p>
            <button className="button button-primary" onClick={() => setVisible(false)}>完成</button>
          </div>
        )}

        {status === 'error' && (
          <div className="update-modal-body">
            <AlertCircle className="text-danger" size={36} />
            <h4>检查更新提示</h4>
            <p className="update-error-text">{errorMessage}</p>
            <button className="button button-primary" onClick={() => setVisible(false)}>知道了</button>
          </div>
        )}

        {(status === 'idle' || status === 'downloading') && update && (
          <div className="update-modal-body">
            <div className="update-header-icon">
              <Sparkles size={28} />
            </div>
            <h4>发现新版本 v{update.version}</h4>
            <div className="update-notes">
              <p className="notes-title">更新说明：</p>
              <div className="notes-content">{update.body || '性能优化与体验改进。'}</div>
            </div>

            {status === 'downloading' ? (
              <div className="download-progress-container">
                <div className="progress-bar-bg">
                  <div className="progress-bar-fill" style={{ width: `${progress}%` }} />
                </div>
                <div className="progress-label">
                  <LoaderCircle className="spinning" size={14} /> 正在下载更新... {progress}%
                </div>
              </div>
            ) : (
              <div className="modal-actions">
                <button className="button button-outline" onClick={() => setVisible(false)}>
                  稍后提醒
                </button>
                <button className="button button-primary" onClick={handleDownloadAndInstall}>
                  <DownloadCloud size={16} /> 立即更新并重启
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
