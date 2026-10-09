import { lazy, Suspense } from 'react';
import { AlertCircle, Download, LoaderCircle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress, ProgressLabel, ProgressValue } from '@/components/ui/progress';

const ReleaseNotes = lazy(() => import('@/components/ReleaseNotes'));
export interface UpdateState {
  status: string; version: string | null; notes: string; error: string | null;
  progress: number; transferred: number; total: number;
}
const megabytes = (bytes: number) => `${(bytes / 1024 ** 2).toFixed(1)} MB`;

export function UpdateCard({ version, update, disabled, onAction }: {
  version: string; update: UpdateState; disabled: boolean; onAction: (method: string) => void;
}) {
  const running = ['checking', 'downloading', 'extracting', 'installing'].includes(update.status);
  const downloading = update.status === 'downloading';
  const preparing = update.status === 'extracting' || update.status === 'installing';
  const retry = update.status === 'error' && Boolean(update.version);
  return <Card className="updates-card">
    <CardHeader><span className="update-icon"><RefreshCw /></span><CardTitle role="heading" aria-level={2}>轻作更新</CardTitle><CardDescription>当前版本 v{version}</CardDescription></CardHeader>
    <CardContent className="flex flex-col gap-4">
      <div><p>{update.status === 'unpublished' ? '尚无公开发布的底座版本。' : update.status === 'current' ? '当前已是最新版本。' : update.version ? `检测到版本 v${update.version}` : '手动检查是否有新版本。'}</p>
        <p className="text-sm text-muted-foreground">下载完成后将自动安装并重启，请先保存正在编辑的文件。</p></div>
      {downloading || preparing ? <div className="flex flex-col gap-2" aria-busy="true">
        <Progress value={downloading ? update.progress : null}>
          <ProgressLabel>{downloading ? '正在下载更新' : update.status === 'extracting' ? '正在解压并校验更新…' : '正在安装，即将重启…'}</ProgressLabel>
          {downloading ? <ProgressValue>{() => `${Math.floor(update.progress)}%`}</ProgressValue> : null}
        </Progress>
        {downloading ? <p className="text-sm text-muted-foreground">{megabytes(update.transferred)}{update.total > 0 ? ` / ${megabytes(update.total)}` : ''}</p> : null}
      </div> : null}
      {update.error ? <Alert variant="destructive"><AlertCircle /><AlertDescription>{update.error}</AlertDescription></Alert> : null}
      {update.notes ? <Suspense fallback={<span>加载更新说明…</span>}><ReleaseNotes body={update.notes} /></Suspense> : null}
    </CardContent>
    <CardFooter className="flex flex-wrap gap-2">
      <Button variant="outline" disabled={disabled || running} onClick={() => onAction('updates.check')}>
        {update.status === 'checking' ? <LoaderCircle data-icon="inline-start" className="animate-spin" /> : <RefreshCw data-icon="inline-start" />}检查更新
      </Button>
      {update.status === 'available' || retry ? <Button disabled={disabled} onClick={() => onAction('updates.download')}><Download data-icon="inline-start" />{retry ? '重新下载并更新' : '下载并重启更新'}</Button> : null}
    </CardFooter>
  </Card>;
}
