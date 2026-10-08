import { FileUp, LoaderCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
export function EmptyState({ busy, onOpen, onDemo }: { busy: boolean; onOpen: () => void; onDemo: () => void }) {
  return <main className="empty-workspace"><Empty>
    <EmptyHeader><EmptyMedia variant="icon"><FileUp /></EmptyMedia><EmptyTitle>打开 PDF，开始编辑标签</EmptyTitle><EmptyDescription>识别文字、框选区域、校正内容，按原始尺寸导出。<br />文件仅在本机处理。</EmptyDescription></EmptyHeader>
    <EmptyContent><div className="flex flex-wrap justify-center gap-3"><Button onClick={onOpen} disabled={busy}><FileUp data-icon="inline-start" />打开 PDF</Button><Button variant="outline" onClick={onDemo} disabled={busy}>{busy ? <LoaderCircle data-icon="inline-start" className="animate-spin" /> : null}使用示例标签</Button></div><p className="text-sm text-muted-foreground">也可以将 PDF 拖到窗口中</p></EmptyContent>
  </Empty></main>;
}
