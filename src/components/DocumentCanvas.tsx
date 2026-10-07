import { CheckCircle2, ChevronLeft, ChevronRight, LoaderCircle } from 'lucide-react';
import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import type { Rect } from '../api';
import type { Editor } from '../useEditor';
import type { Tool } from './Toolbar';

interface CanvasProps { editor: Editor; tool: Tool; showRegions: boolean; zoom: number }
interface Point { x: number; y: number }

const rectangle = (start: Point, end: Point): Rect => ({
  x: Math.min(start.x, end.x), y: Math.min(start.y, end.y),
  width: Math.abs(start.x - end.x), height: Math.abs(start.y - end.y),
});
const rectStyle = (rect: Rect): CSSProperties => ({
  left: `${rect.x * 100}%`, top: `${rect.y * 100}%`, width: `${rect.width * 100}%`, height: `${rect.height * 100}%`,
});

export function DocumentCanvas({ editor, tool, showRegions, zoom }: CanvasProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const documentRef = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState({ width: 600, height: 500 });
  const [drag, setDrag] = useState<{ start: Point; end: Point } | null>(null);
  const [imageReady, setImageReady] = useState(false);
  const [compareOriginal, setCompareOriginal] = useState(false);
  const busy = Boolean(editor.operation || editor.previewLoading);
  const page = editor.document!.pages[editor.page];
  const ratio = page.width_pt / page.height_pt;
  const fitWidth = Math.min(Math.max(160, viewport.width - 68), Math.max(160, viewport.height - 90) * ratio);
  const width = fitWidth * zoom / 100;
  const height = width / ratio;
  const original = `/api/documents/${encodeURIComponent(editor.document!.id)}/pages/${editor.page}/image`;
  const image = compareOriginal ? original : editor.previewUrl ?? original;

  useEffect(() => {
    const target = viewportRef.current;
    if (!target) return;
    const observer = new ResizeObserver(entries => {
      const rect = entries[0].contentRect;
      setViewport({ width: rect.width, height: rect.height });
    });
    observer.observe(target);
    return () => observer.disconnect();
  }, []);

  useEffect(() => { setImageReady(false); setDrag(null); }, [image]);
  useEffect(() => { setCompareOriginal(false); }, [editor.document?.id, editor.page, editor.edits]);

  function pointFor(event: PointerEvent<HTMLDivElement>): Point {
    const rect = documentRef.current!.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)),
    };
  }

  function pointerDown(event: PointerEvent<HTMLDivElement>) {
    if (tool !== 'region' || busy || !imageReady || compareOriginal || event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = pointFor(event);
    setDrag({ start: point, end: point });
  }

  function pointerUp(event: PointerEvent<HTMLDivElement>) {
    if (!drag) return;
    const rect = rectangle(drag.start, pointFor(event));
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    setDrag(null);
    if (rect.width * width >= 5 && rect.height * height >= 5) editor.addManualRegion(rect);
  }

  return <section className="canvas-column" aria-label="PDF 页面预览">
    <div className="canvas-viewport" ref={viewportRef}>
      {editor.edits.some(edit => edit.page === editor.page) ? <button className={`compare-button ${compareOriginal ? 'active' : ''}`} onClick={() => setCompareOriginal(!compareOriginal)} disabled={busy}>
        {compareOriginal ? '返回修改预览' : '查看原稿'}
      </button> : null}
      <div className="canvas-layout" style={{
        minWidth: zoom > 100 ? width + 68 : undefined,
        minHeight: zoom > 100 ? height + 68 : undefined,
      }}>
        <div ref={documentRef} className={`document-page ${tool === 'region' ? 'drawing' : ''} ${busy ? 'is-busy' : ''}`}
          style={{ width, height }} onPointerDown={pointerDown}
          onPointerMove={event => { if (drag) setDrag(previous => previous ? { ...previous, end: pointFor(event) } : null); }}
          onPointerUp={pointerUp} onPointerCancel={() => setDrag(null)}>
          <img src={image} alt={`PDF 第 ${editor.page + 1} 页`} draggable={false} onLoad={() => setImageReady(true)} onError={editor.imageFailed} />
          {imageReady && !compareOriginal ? editor.regions.map(region => {
            const selected = editor.selectedId === region.id;
            if (!selected && !showRegions) return null;
            return <button key={region.id} type="button" className={`text-region ${selected ? 'selected' : ''} ${editor.edits.some(edit => edit.id === region.id) ? 'modified' : ''}`}
              style={rectStyle(region.rect)} aria-label={`选择文字：${region.text || '手动框选区域'}`} title={region.text || '手动框选区域'}
              disabled={busy || tool === 'region'} onClick={() => editor.select(region.id)}>
              {selected ? <><i className="handle top-left" /><i className="handle top-right" /><i className="handle bottom-left" /><i className="handle bottom-right" /></> : null}
            </button>;
          }) : null}
          {drag ? <div className="drawn-region" style={rectStyle(rectangle(drag.start, drag.end))} /> : null}
          {!imageReady || editor.previewLoading ? <div className="image-loading"><LoaderCircle className="spinning" size={25} /><span>载入页面…</span></div> : null}
        </div>
      </div>
    </div>
    <footer className="canvas-status">
      <div className="page-controls">
        {editor.document!.page_count > 1 ? <button className="icon-button" aria-label="上一页" disabled={busy || editor.page === 0} onClick={() => void editor.changePage(editor.page - 1)}><ChevronLeft size={18} /></button> : null}
        <span>第 {editor.page + 1} 页 / 共 {editor.document!.page_count} 页</span>
        {editor.document!.page_count > 1 ? <button className="icon-button" aria-label="下一页" disabled={busy || editor.page + 1 >= editor.document!.page_count} onClick={() => void editor.changePage(editor.page + 1)}><ChevronRight size={18} /></button> : null}
      </div>
      <div className="recognition-status">
        {editor.operation === 'recognizing' ? <><LoaderCircle className="spinning" size={19} /><span>正在识别文字</span></> :
          editor.recognition ? <><CheckCircle2 size={20} /><span>{editor.regions.length ? '已识别文字' : '识别完成'}</span></> : <span>可手动框选修改</span>}
      </div>
    </footer>
  </section>;
}
