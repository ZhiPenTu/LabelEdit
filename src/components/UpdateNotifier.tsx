import { DownloadCloud, Sparkles, X, CheckCircle2, AlertCircle, LoaderCircle } from 'lucide-react';
import type { AppUpdater } from '../platform/useAppUpdater';

export function UpdateNotifier({ updater }: { updater: AppUpdater }) {
  const { visible, setVisible, status, progress, errorMessage, update, install } = updater;
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
                <button className="button button-primary" onClick={install}>
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
