import { FileUp, LoaderCircle } from 'lucide-react';
import type { Editor } from '../useEditor';

export function EmptyState({ editor, onOpen }: { editor: Editor; onOpen: () => void }) {
  const busy = Boolean(editor.operation);
  return <main className="empty-workspace">
    <div className="empty-content">
      <div className="empty-file-icon"><FileUp size={34} strokeWidth={1.6} /></div>
      <h1>让 PDF 里的文字<br />重新可以修改。</h1>
      <p>打开文件，识别文字，直接修改。<br />扫描标签也可以，导出保留原始页面尺寸。</p>
      <div className="empty-actions">
        <button className="button button-primary" onClick={onOpen} disabled={busy}>{busy ? <LoaderCircle className="spinning" size={18} /> : <FileUp size={18} />}打开 PDF</button>
        <button className="button button-outline" onClick={() => void editor.openDemo()} disabled={busy}>使用示例标签</button>
      </div>
      <span className="drop-note">也可以把 PDF 拖到这里</span>
      <div className="local-note"><span />文件仅在本机处理</div>
    </div>
  </main>;
}
