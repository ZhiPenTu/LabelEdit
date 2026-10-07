import { useEffect, useState } from 'react';
import { LoaderCircle, RefreshCw, AlertTriangle } from 'lucide-react';
import { checkBackendHealth, getApiBase } from '../api';

export function BackendLoadingOverlay({ onReady }: { onReady?: () => void }) {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    let active = true;
    let attempts = 0;
    const maxAttempts = 60; // 30 seconds

    async function probe() {
      await getApiBase();
      const status = await checkBackendHealth();
      if (!active) return;

      if (status.ready) {
        setReady(true);
        onReady?.();
      } else {
        attempts += 1;
        if (attempts >= maxAttempts) {
          setError(status.error || '本地后端启动超时，请重试或检查系统防火墙/安全设置。');
        } else {
          setTimeout(probe, 500);
        }
      }
    }

    void probe();

    return () => {
      active = false;
    };
  }, [retrying, onReady]);

  if (ready) return null;

  return (
    <div className="backend-overlay" role="dialog" aria-modal="true" aria-label="服务启动状态">
      <div className="backend-card">
        {error ? (
          <>
            <div className="status-icon error">
              <AlertTriangle size={36} />
            </div>
            <h3>本地引擎未响应</h3>
            <p className="error-desc">{error}</p>
            <button
              className="button button-primary"
              onClick={() => {
                setError(null);
                setRetrying(r => !r);
              }}
            >
              <RefreshCw size={16} /> 重新连接
            </button>
          </>
        ) : (
          <>
            <div className="status-icon loading">
              <LoaderCircle className="spinning" size={38} />
            </div>
            <h3>正在初始化本地离线引擎</h3>
            <p>正在加载 PP-OCR 深度学习模型与 PDFium 渲染核心...</p>
            <div className="engine-meta">
              <span>完全离线运行</span>
              <span>•</span>
              <span>数据仅存本机</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
