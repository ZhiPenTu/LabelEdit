import { CheckCircle2, ChevronLeft, ChevronRight, LoaderCircle } from 'lucide-react';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { api } from '../api';
import type { Rect, Tool } from '../editor/types';
import { rectangle } from '../editor/geometry';
import { useCanvasInteractions } from '../editor/useCanvasInteractions';
import type { Editor } from '../useEditor';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export type CanvasModel = Pick<Editor, 'document' | 'page' | 'regions' | 'edits' | 'selectedId' | 'selectedRegion' | 'previewUrl' | 'previewLoading' | 'operation' | 'recognition' | 'select' | 'updateRegionRect' | 'addManualRegion' | 'changePage' | 'imageFailed'>;
interface CanvasProps { editor: CanvasModel; tool: Tool; showRegions: boolean; zoom: number }
const rectStyle = (rect: Rect): CSSProperties => ({ left: `${rect.x * 100}%`, top: `${rect.y * 100}%`, width: `${rect.width * 100}%`, height: `${rect.height * 100}%` });

export function DocumentCanvas({ editor, tool, showRegions, zoom }: CanvasProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const documentRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [viewport, setViewport] = useState({ width: 600, height: 500 });
  const [loadedImage, setLoadedImage] = useState<string | null>(null);
  const [compareOriginal, setCompareOriginal] = useState(false);
  const busy = Boolean(editor.operation || editor.previewLoading);
  const page = editor.document!.pages[editor.page];
  const ratio = page.width_pt / page.height_pt;
  const fitWidth = Math.min(Math.max(160, viewport.width - 68), Math.max(160, viewport.height - 90) * ratio);
  const width = fitWidth * zoom / 100;
  const height = width / ratio;
  const original = api.imageUrl(editor.document!.id, editor.page);
  const image = compareOriginal ? original : editor.previewUrl ?? original;
  const imageReady = loadedImage === image;

  const { drag, setDrag, activeTransform, pointerDown, pointerUp, startTransform } = useCanvasInteractions({ editor, documentRef, tool, busy, imageReady, compareOriginal, width, height, image });

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

  useEffect(() => {
    if (imgRef.current?.complete && imgRef.current.naturalWidth > 0) {
      setLoadedImage(image);
    }
  }, [image]);
  useEffect(() => { setCompareOriginal(false); }, [editor.document?.id, editor.page, editor.edits]);

  const getTransformCursor = () => {
    if (!activeTransform) return undefined;
    if (activeTransform.type === 'move') return 'grabbing';
    if (activeTransform.type === 'nw' || activeTransform.type === 'se') return 'nwse-resize';
    return 'nesw-resize';
  };

  return <section className="canvas-column" aria-label="PDF 页面预览">
      {editor.edits.some(edit => edit.page === editor.page) ? <Button variant="outline" size="sm" className="compare-button" onClick={() => setCompareOriginal(!compareOriginal)} disabled={busy}>
        {compareOriginal ? '返回修改预览' : '查看原稿'}
      </Button> : null}
    <div className="canvas-viewport" ref={viewportRef}>
      <div className="canvas-layout" style={{
        minWidth: zoom > 100 ? width + 68 : undefined,
        minHeight: zoom > 100 ? height + 68 : undefined,
      }}>
        <div ref={documentRef} tabIndex={0} aria-label="PDF 画布" data-editor-canvas className={cn('document-page', tool === 'region' && 'drawing', busy && 'is-busy')}
          style={{ width, height, cursor: getTransformCursor() }} onPointerDown={pointerDown}
          onPointerMove={event => { if (drag) setDrag(previous => previous ? { ...previous, end: (() => { const bounds = documentRef.current!.getBoundingClientRect(); return { x: Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width)), y: Math.min(1, Math.max(0, (event.clientY - bounds.top) / bounds.height)) }; })() } : null); }}
          onPointerUp={pointerUp} onPointerCancel={() => setDrag(null)}>
          <img ref={imgRef} src={image} alt={`PDF 第 ${editor.page + 1} 页`} draggable={false} onLoad={() => setLoadedImage(image)} onError={editor.imageFailed} />
          {imageReady && !compareOriginal ? editor.regions.map(region => {
            const selected = editor.selectedId === region.id;
            if (!selected && !showRegions) return null;
            const isTransforming = activeTransform?.id === region.id;
            const displayRect = isTransforming ? activeTransform.currentRect : region.rect;
            return <button key={region.id} type="button" className={cn('text-region', selected && 'selected', isTransforming && 'is-transforming', editor.edits.some(edit => edit.id === region.id) && 'modified')}
              style={rectStyle(displayRect)} aria-label={`选择文字：${region.text || '手动框选区域'}`} title={region.text || '手动框选区域'}
              aria-pressed={selected} disabled={busy || tool === 'region'} onPointerDown={event => startTransform(event, 'move', region)} onClick={() => editor.select(region.id)}>
              {selected ? <>
                <i className="handle top-left" aria-hidden="true" onPointerDown={event => startTransform(event, 'nw', region)} />
                <i className="handle top-right" aria-hidden="true" onPointerDown={event => startTransform(event, 'ne', region)} />
                <i className="handle bottom-left" aria-hidden="true" onPointerDown={event => startTransform(event, 'sw', region)} />
                <i className="handle bottom-right" aria-hidden="true" onPointerDown={event => startTransform(event, 'se', region)} />
              </> : null}
            </button>;
          }) : null}
          {drag ? <div className="drawn-region" style={rectStyle(rectangle(drag.start, drag.end))} /> : null}
          {!imageReady || editor.previewLoading ? <div className="image-loading"><LoaderCircle className="spinning" size={25} /><span>载入页面…</span></div> : null}
        </div>
      </div>
    </div>
    <footer className="canvas-status">
      <div className="page-controls">
        {editor.document!.page_count > 1 ? <Button variant="ghost" size="icon" aria-label="上一页" disabled={busy || editor.page === 0} onClick={() => void editor.changePage(editor.page - 1)}><ChevronLeft /></Button> : null}
        <span>第 {editor.page + 1} 页 / 共 {editor.document!.page_count} 页</span>
        {editor.document!.page_count > 1 ? <Button variant="ghost" size="icon" aria-label="下一页" disabled={busy || editor.page + 1 >= editor.document!.page_count} onClick={() => void editor.changePage(editor.page + 1)}><ChevronRight /></Button> : null}
      </div>
      <div className="recognition-status">
        {editor.operation === 'recognizing' ? <><LoaderCircle className="spinning" size={19} /><span>正在识别文字</span></> :
          editor.recognition ? <><CheckCircle2 size={20} /><span>{editor.regions.length ? '已识别文字' : '识别完成'}</span></> : <span>可手动框选修改</span>}
      </div>
    </footer>
  </section>;
}
