import { AlertCircle, CheckCircle2, X } from 'lucide-react';
import { useRef, useState, type DragEvent } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { useEditor } from './useEditor';
import { useTextDraft } from './editor/useTextDraft';
import { useAppUpdater } from './platform/useAppUpdater';
import { useMediaQuery } from './platform/useMediaQuery';
import { Header } from './components/Header';
import { TextSidebar } from './components/TextSidebar';
import { Inspector } from './components/Inspector';
import { DocumentCanvas, type CanvasModel } from './components/DocumentCanvas';
import { Toolbar } from './components/Toolbar';
import { EmptyState } from './components/EmptyState';
import { BackendLoadingOverlay } from './components/BackendLoadingOverlay';
import { UpdateNotifier } from './components/UpdateNotifier';
import type { Tool } from './editor/types';

export default function App() {
  const editor = useEditor();
  const updater = useAppUpdater();
  const input = useRef<HTMLInputElement>(null);
  const dragCount = useRef(0);
  const narrow = useMediaQuery('(max-width: 959px)');
  const [dragging, setDragging] = useState(false);
  const [tool, setTool] = useState<Tool>('select');
  const [showRegions, setShowRegions] = useState(true);
  const [zoom, setZoom] = useState(100);
  const [panel, setPanel] = useState<'regions' | 'inspector' | null>(null);
  const panelOpener = useRef<HTMLElement | null>(null);
  function openPanel(next: 'regions' | 'inspector') {
    panelOpener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setPanel(next);
  }
  const textDraft = useTextDraft(`${editor.document?.id}:${editor.page}:${editor.selectedId}`, editor.selectedRegion, editor.selectedEdit, editor.invalidateDownload);
  const onOpen = () => input.current?.click();
  async function openFile(file: File) { setZoom(100); setTool('select'); await editor.upload(file); }
  function dragEnter(event: DragEvent<HTMLDivElement>) {
    if (!event.dataTransfer.types.includes('Files')) return;
    event.preventDefault(); dragCount.current += 1; setDragging(true);
  }
  const sidebar = <TextSidebar regions={editor.regions} edits={editor.edits} selectedId={editor.selectedId} language={editor.language} busy={editor.busy} recognizing={editor.operation === 'recognizing'}
    onSelect={id => { editor.select(id); if (narrow) setPanel('inspector'); }} onLanguage={editor.setLanguage} onRecognize={() => { void editor.recognize(); }} />;
  const inspector = <Inspector region={editor.selectedRegion} saved={editor.selectedEdit} draft={textDraft.draft} updateDraft={textDraft.update} busy={editor.busy} applying={editor.operation === 'applying'} edits={editor.edits} canUndo={editor.canUndo}
    onUndo={() => { void editor.undo(); }} onApply={edit => { void editor.apply(edit); }} onRemove={id => { void editor.remove(id); }}
    onSelectEdit={edit => { if (edit.page !== editor.page) void editor.changePage(edit.page).then(() => editor.select(edit.id)); else editor.select(edit.id); }} />;
  const canvas: CanvasModel = {
    document: editor.document, page: editor.page, regions: editor.regions, edits: editor.edits, selectedId: editor.selectedId, selectedRegion: editor.selectedRegion,
    previewUrl: editor.previewUrl, previewLoading: editor.previewLoading, operation: editor.operation, recognition: editor.recognition,
    select: editor.select, updateRegionRect: editor.updateRegionRect, addManualRegion: editor.addManualRegion, changePage: editor.changePage, imageFailed: editor.imageFailed,
  };
  return <div className="app-shell" onDragEnter={dragEnter}
    onDragOver={event => { if (event.dataTransfer.types.includes('Files')) { event.preventDefault(); event.dataTransfer.dropEffect = editor.busy ? 'none' : 'copy'; } }}
    onDragLeave={event => { event.preventDefault(); dragCount.current = Math.max(0, dragCount.current - 1); if (!dragCount.current) setDragging(false); }}
    onDrop={event => { event.preventDefault(); dragCount.current = 0; setDragging(false); const file = event.dataTransfer.files[0]; if (file && !editor.busy) void openFile(file); }}>
    <BackendLoadingOverlay /><UpdateNotifier updater={updater} />
    <input ref={input} className="file-input" type="file" accept="application/pdf,.pdf" aria-label="选择 PDF 文件" onChange={event => { const file = event.target.files?.[0]; if (file) void openFile(file); event.target.value = ''; }} />
    <Header filename={editor.document?.filename} busy={editor.busy} exporting={editor.operation === 'exporting'} onOpen={onOpen} onExport={() => { void editor.exportPDF(); }} onCheckUpdates={updater.available ? updater.check : undefined} />
    {editor.document ? <>
      <Toolbar page={editor.document.pages[editor.page]} busy={editor.busy} canUndo={editor.canUndo} onUndo={() => { void editor.undo(); }} tool={tool} setTool={setTool} showRegions={showRegions} setShowRegions={setShowRegions} zoom={zoom} setZoom={setZoom} narrow={narrow} onShowRegions={() => openPanel('regions')} onShowInspector={() => openPanel('inspector')} />
      <main className="editor-workspace">
        {!narrow ? sidebar : null}<DocumentCanvas editor={canvas} tool={tool} showRegions={showRegions} zoom={zoom} />{!narrow ? inspector : null}
      </main>
      {narrow ? <Sheet open={panel !== null} onOpenChange={open => { if (!open) setPanel(null); }}>
        <SheetContent side={panel === 'regions' ? 'left' : 'right'} className="editor-sheet" finalFocus={panelOpener}>
          <SheetHeader><SheetTitle>{panel === 'regions' ? '文字区域' : '编辑文字'}</SheetTitle><SheetDescription className="sr-only">选择文字区域并修改标签内容</SheetDescription></SheetHeader>
          {panel === 'regions' ? sidebar : inspector}
        </SheetContent>
      </Sheet> : null}
    </> : <EmptyState busy={editor.busy} onOpen={onOpen} onDemo={() => { void editor.openDemo(); }} />}
    {editor.error || editor.notice ? <Alert variant={editor.error ? 'destructive' : 'default'} role={editor.error ? 'alert' : 'status'} className="message-bar">
      {editor.error ? <AlertCircle /> : <CheckCircle2 />}<AlertDescription><span>{editor.error || editor.notice}</span>{!editor.error && editor.download ? <a className="download-link" href={editor.download.url} download={editor.download.filename}>下载已生成 PDF</a> : null}</AlertDescription>
      <Button variant="ghost" size="icon" className="message-close" aria-label="关闭提示" onClick={editor.error ? editor.clearError : editor.clearNotice}><X /></Button>
    </Alert> : null}
    {dragging ? <div className="drop-overlay"><div>松开以打开 PDF<span>{editor.busy ? '请等待当前操作完成' : '文件仅在本机处理'}</span></div></div> : null}
  </div>;
}
