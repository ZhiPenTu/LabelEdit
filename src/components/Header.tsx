import { LoaderCircle, RefreshCw } from 'lucide-react';
import type { Editor } from '../useEditor';

export function Header({
  editor,
  onOpen,
  onCheckUpdates,
}: {
  editor: Editor;
  onOpen: () => void;
  onCheckUpdates?: () => void;
}) {
  const busy = Boolean(editor.operation || editor.previewLoading);
  return (
    <header className="app-header">
      <div className="brand">
        <svg className="brand-mark" viewBox="0 0 34 44" aria-hidden="true">
          <path d="M3 1h18l11 11v29a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V3a2 2 0 0 1 2-2Z" fill="currentColor" />
          <path d="M21 2v10h10M9 22h7M9 28h15M9 34h11" fill="none" stroke="white" strokeWidth="2.2" strokeLinejoin="round" />
        </svg>
        <span>LabelEdit</span>
      </div>
      <div className="filename" title={editor.document?.filename}>{editor.document?.filename ?? 'PDF 文字编辑'}</div>
      <div className="header-actions">
        {onCheckUpdates && (
          <button
            className="button button-ghost"
            onClick={onCheckUpdates}
            title="检查软件更新"
            aria-label="检查更新"
            style={{ padding: '0.4rem 0.6rem', fontSize: '0.85rem' }}
          >
            <RefreshCw size={14} style={{ marginRight: '4px' }} /> 检查更新
          </button>
        )}
        <button className="button button-outline" onClick={onOpen} disabled={busy}>打开 PDF</button>
        <button className="button button-primary" onClick={() => void editor.exportPDF()} disabled={!editor.document || busy}>
          {editor.operation === 'exporting' ? <><LoaderCircle className="spinning" size={17} /> 正在导出</> : '导出 PDF'}
        </button>
      </div>
    </header>
  );
}
