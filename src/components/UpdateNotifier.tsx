import { DownloadCloud, LoaderCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import type { AppUpdater } from '../platform/useAppUpdater';
export function UpdateNotifier({ updater }: { updater: AppUpdater }) {
  const { visible, setVisible, status, progress, errorMessage, update, install } = updater;
  const title = status === 'checking' ? '正在检查新版本…' : status === 'upToDate' ? '当前已是最新版本' : status === 'error' ? '软件更新提示' : `发现新版本 v${update?.version ?? ''}`;
  return <Dialog open={visible} onOpenChange={open => { if (status !== 'downloading') setVisible(open); }}><DialogContent showCloseButton={status !== 'downloading'}>
    <DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>{status === 'error' ? errorMessage : status === 'upToDate' ? '您的 LabelEdit 已是最新发行版。' : status === 'checking' ? '正在连接官方发布源。' : '安装完成后将自动重新启动。'}</DialogDescription></DialogHeader>
    {update && (status === 'idle' || status === 'downloading') ? <div className="update-notes">{update.body || '性能优化与体验改进。'}</div> : null}
    {status === 'downloading' ? <div className="flex flex-col gap-3"><Progress value={progress} aria-label="更新下载进度" /><p className="text-sm text-muted-foreground">正在下载更新… {progress}%</p></div> : null}
    <DialogFooter>{status === 'checking' ? <LoaderCircle className="animate-spin" /> : status === 'idle' && update ? <><Button variant="outline" onClick={() => setVisible(false)}>稍后提醒</Button><Button onClick={() => { void install(); }}><DownloadCloud data-icon="inline-start" />立即更新并重启</Button></> : status !== 'downloading' ? <Button onClick={() => setVisible(false)}>完成</Button> : null}</DialogFooter>
  </DialogContent></Dialog>;
}
