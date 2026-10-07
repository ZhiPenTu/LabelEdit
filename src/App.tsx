import { AlertCircle, CheckCircle2, X } from 'lucide-react';
import { useRef, useState, type DragEvent } from 'react';
import { useEditor } from './useEditor';
import { Header } from './components/Header';
import { TextSidebar } from './components/TextSidebar';
import { Inspector } from './components/Inspector';
import { DocumentCanvas } from './components/DocumentCanvas';
import { Toolbar, type Tool } from './components/Toolbar';
import { EmptyState } from './components/EmptyState';
import { BackendLoadingOverlay } from './components/BackendLoadingOverlay';
import { UpdateNotifier } from './components/UpdateNotifier';

export default function App() {
  const editor = useEditor();
  const input = useRef<HTMLInputElement>(null);
  const manualCheckRef = useRef<(() => void) | null>(null);
  const dragCount = useRef(0);
  const [dragging, setDragging] = useState(false);
  const [tool, setTool] = useState<Tool>('select');
  const [showRegions, setShowRegions] = useState(true);
  const [zoom, setZoom] = useState(100);
  const busy = Boolean(editor.operation || editor.previewLoading);

  async function openFile(file: File) {
    setZoom(100);
    setTool('select');
    await editor.upload(file);
  }

  function dragEnter(event: DragEvent<HTMLDivElement>) {
    if (!event.dataTransfer.types.includes('Files')) return;
    event.preventDefault();
    dragCount.current += 1;
    setDragging(true);
  }

  return (
    <div
      className="app-shell"
      onDragEnter={dragEnter}
      onDragOver={event => {
        if (event.dataTransfer.types.includes('Files')) {
          event.preventDefault();
          event.dataTransfer.dropEffect = busy ? 'none' : 'copy';
        }
      }}
      onDragLeave={event => {
        event.preventDefault();
        dragCount.current = Math.max(0, dragCount.current - 1);
        if (!dragCount.current) setDragging(false);
      }}
      onDrop={event => {
        event.preventDefault();
        dragCount.current = 0;
        setDragging(false);
        const file = event.dataTransfer.files[0];
        if (file && !busy) void openFile(file);
      }}
    >
      <BackendLoadingOverlay />
      <UpdateNotifier onManualCheckRef={fn => (manualCheckRef.current = fn)} />

      <input
        ref={input}
        className="file-input"
        type="file"
        accept="application/pdf,.pdf"
        aria-label="选择 PDF 文件"
        onChange={event => {
          const file = event.target.files?.[0];
          if (file) void openFile(file);
          event.target.value = '';
        }}
      />
      <Header
        editor={editor}
        onOpen={() => input.current?.click()}
        onCheckUpdates={() => manualCheckRef.current?.()}
      />
      {editor.document ? (
        <>
          <Toolbar
            editor={editor}
            tool={tool}
            setTool={setTool}
            showRegions={showRegions}
            setShowRegions={setShowRegions}
            zoom={zoom}
            setZoom={setZoom}
          />
          <main className="editor-workspace">
            <TextSidebar editor={editor} />
            <DocumentCanvas editor={editor} tool={tool} showRegions={showRegions} zoom={zoom} />
            <Inspector editor={editor} />
          </main>
        </>
      ) : (
        <EmptyState editor={editor} onOpen={() => input.current?.click()} />
      )}
      {editor.error ? (
        <div className="message-bar error-message" role="alert">
          <AlertCircle size={20} />
          <span>{editor.error}</span>
          <button aria-label="关闭错误提示" onClick={editor.clearError}>
            <X size={18} />
          </button>
        </div>
      ) : editor.notice ? (
        <div className="message-bar notice-message" role="status">
          <CheckCircle2 size={19} />
          <span>
            {editor.notice}
            {editor.download ? (
              <a className="download-link" href={editor.download.url} download={editor.download.filename}>
                下载已生成 PDF
              </a>
            ) : null}
          </span>
          <button aria-label="关闭提示" onClick={editor.clearNotice}>
            <X size={18} />
          </button>
        </div>
      ) : null}
      {dragging ? (
        <div className="drop-overlay">
          <div>
            松开以打开 PDF<span>{busy ? '请等待当前操作完成' : '文件仅在本机处理'}</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
