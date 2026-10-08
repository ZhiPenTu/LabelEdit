import { LoaderCircle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useBackendStatus } from '../platform/useBackendStatus';
export function BackendLoadingOverlay() {
  const { ready, error, retry } = useBackendStatus();
  return <Dialog open={!ready}><DialogContent showCloseButton={false}>
    <DialogHeader><DialogTitle>{error ? '本地引擎未响应' : '正在初始化本地离线引擎'}</DialogTitle><DialogDescription>{error || '正在连接 OCR 与 PDF 渲染服务，文件仅在本机处理。'}</DialogDescription></DialogHeader>
    {error ? <Button onClick={retry}><RefreshCw data-icon="inline-start" />重新连接</Button> : <div className="flex items-center gap-3 text-sm text-muted-foreground"><LoaderCircle className="animate-spin" />正在连接…</div>}
  </DialogContent></Dialog>;
}
