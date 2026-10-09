import { Download, FileUp, LoaderCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface HeaderProps { filename?: string; busy: boolean; exporting: boolean; onOpen: () => void; onExport: () => void }
export function Header({ filename, busy, exporting, onOpen, onExport }: HeaderProps) {
  return <header className="app-header">
    <div className="brand">
      <svg className="brand-mark" viewBox="0 0 34 44" aria-hidden="true"><path d="M3 1h18l11 11v29a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V3a2 2 0 0 1 2-2Z" fill="currentColor" /><path d="M21 2v10h10M9 22h7M9 28h15M9 34h11" fill="none" stroke="white" strokeWidth="2.2" strokeLinejoin="round" /></svg>
      <span>LabelEdit</span>
    </div>
    <div className="filename" title={filename}>{filename ?? '本地 PDF 文字编辑'}</div>
    <div className="header-actions">
      <Button variant="outline" onClick={onOpen} disabled={busy}><FileUp data-icon="inline-start" />打开 PDF</Button>
      <Button onClick={onExport} disabled={!filename || busy}>
        {exporting ? <LoaderCircle data-icon="inline-start" className="animate-spin" /> : <Download data-icon="inline-start" />}{exporting ? '正在导出' : '导出 PDF'}
      </Button>
    </div>
  </header>;
}
