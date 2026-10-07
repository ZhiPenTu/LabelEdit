import { CheckCircle2, ChevronLeft, ChevronRight, LoaderCircle } from 'lucide-react';
import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import { api, type Rect, type TextRegion } from '../api';
import type { Editor } from '../useEditor';
import type { Tool } from './Toolbar';

interface CanvasProps { editor: Editor; tool: Tool; showRegions: boolean; zoom: number }
interface Point { x: number; y: number }
type TransformType = 'move' | 'nw' | 'ne' | 'sw' | 'se';

interface ActiveTransform {
  id: string;
  type: TransformType;
  startX: number;
  startY: number;
  docWidth: number;
  docHeight: number;
  startRect: Rect;
  currentRect: Rect;
}

const rectangle = (start: Point, end: Point): Rect => ({
  x: Math.min(start.x, end.x), y: Math.min(start.y, end.y),
  width: Math.abs(start.x - end.x), height: Math.abs(start.y - end.y),
});
const rectStyle = (rect: Rect): CSSProperties => ({
  left: `${rect.x * 100}%`, top: `${rect.y * 100}%`, width: `${rect.width * 100}%`, height: `${rect.height * 100}%`,
});

function computeTransformedRect(
  type: TransformType,
  startRect: Rect,
  dx: number,
  dy: number,
  canvasWidth: number,
  canvasHeight: number,
): Rect {
  const minWidth = Math.max(0.005, 8 / canvasWidth);
  const minHeight = Math.max(0.005, 8 / canvasHeight);

  if (type === 'move') {
    const nextX = Math.max(0, Math.min(1 - startRect.width, startRect.x + dx));
    const nextY = Math.max(0, Math.min(1 - startRect.height, startRect.y + dy));
    return {
      x: nextX,
      y: nextY,
      width: startRect.width,
      height: startRect.height,
    };
  }

  let left = startRect.x;
  let top = startRect.y;
  let right = startRect.x + startRect.width;
  let bottom = startRect.y + startRect.height;

  if (type === 'nw') {
    left = Math.max(0, Math.min(right - minWidth, startRect.x + dx));
    top = Math.max(0, Math.min(bottom - minHeight, startRect.y + dy));
  } else if (type === 'ne') {
    right = Math.min(1, Math.max(left + minWidth, right + dx));
    top = Math.max(0, Math.min(bottom - minHeight, startRect.y + dy));
  } else if (type === 'sw') {
    left = Math.max(0, Math.min(right - minWidth, startRect.x + dx));
    bottom = Math.min(1, Math.max(top + minHeight, bottom + dy));
  } else if (type === 'se') {
    right = Math.min(1, Math.max(left + minWidth, right + dx));
    bottom = Math.min(1, Math.max(top + minHeight, bottom + dy));
  }

  return {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
  };
}

export function DocumentCanvas({ editor, tool, showRegions, zoom }: CanvasProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const documentRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [viewport, setViewport] = useState({ width: 600, height: 500 });
  const [drag, setDrag] = useState<{ start: Point; end: Point } | null>(null);
  const [loadedImage, setLoadedImage] = useState<string | null>(null);
  const [compareOriginal, setCompareOriginal] = useState(false);
  const [activeTransform, setActiveTransform] = useState<ActiveTransform | null>(null);
  const activeTransformRef = useRef<ActiveTransform | null>(null);
  activeTransformRef.current = activeTransform;

  const busy = Boolean(editor.operation || editor.previewLoading);
  const page = editor.document!.pages[editor.page];
  const ratio = page.width_pt / page.height_pt;
  const fitWidth = Math.min(Math.max(160, viewport.width - 68), Math.max(160, viewport.height - 90) * ratio);
  const width = fitWidth * zoom / 100;
  const height = width / ratio;
  const original = api.imageUrl(editor.document!.id, editor.page);
  const image = compareOriginal ? original : editor.previewUrl ?? original;
  const imageReady = loadedImage === image;

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
    setDrag(null);
    if (imgRef.current?.complete && imgRef.current.naturalWidth > 0) {
      setLoadedImage(image);
    }
  }, [image]);
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

  function startTransform(event: PointerEvent<HTMLElement>, type: TransformType, region: TextRegion) {
    if (busy || compareOriginal || event.button !== 0 || tool === 'region') return;
    event.stopPropagation();
    event.preventDefault();

    if (editor.selectedId !== region.id) {
      editor.select(region.id);
    }

    const docEl = documentRef.current;
    if (!docEl) return;
    const docRect = docEl.getBoundingClientRect();

    const transform: ActiveTransform = {
      id: region.id,
      type,
      startX: event.clientX,
      startY: event.clientY,
      docWidth: docRect.width,
      docHeight: docRect.height,
      startRect: { ...region.rect },
      currentRect: { ...region.rect },
    };
    activeTransformRef.current = transform;
    setActiveTransform(transform);
  }

  useEffect(() => {
    if (!activeTransform) return;

    const handlePointerMove = (e: globalThis.PointerEvent) => {
      const current = activeTransformRef.current;
      if (!current) return;
      const dx = (e.clientX - current.startX) / current.docWidth;
      const dy = (e.clientY - current.startY) / current.docHeight;
      const nextRect = computeTransformedRect(
        current.type,
        current.startRect,
        dx,
        dy,
        current.docWidth,
        current.docHeight,
      );
      const updated = { ...current, currentRect: nextRect };
      activeTransformRef.current = updated;
      setActiveTransform(updated);
    };

    const handlePointerUp = (e: globalThis.PointerEvent) => {
      const current = activeTransformRef.current;
      activeTransformRef.current = null;
      setActiveTransform(null);
      if (!current) return;

      const distPixels = Math.hypot(e.clientX - current.startX, e.clientY - current.startY);
      if (distPixels < 3) return;

      const { startRect, currentRect } = current;
      const changed =
        Math.abs(currentRect.x - startRect.x) > 1e-4 ||
        Math.abs(currentRect.y - startRect.y) > 1e-4 ||
        Math.abs(currentRect.width - startRect.width) > 1e-4 ||
        Math.abs(currentRect.height - startRect.height) > 1e-4;

      if (changed) {
        void editor.updateRegionRect(current.id, currentRect);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        activeTransformRef.current = null;
        setActiveTransform(null);
      }
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [Boolean(activeTransform), editor]);

  useEffect(() => {
    if (!editor.selectedRegion || busy || compareOriginal) return;

    const handleArrowNudge = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable) {
        return;
      }
      const arrows = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
      if (!arrows.includes(event.key)) return;

      event.preventDefault();
      const stepPixels = event.shiftKey ? 5 : 1;
      const dxNorm = stepPixels / width;
      const dyNorm = stepPixels / height;

      let dx = 0;
      let dy = 0;
      if (event.key === 'ArrowLeft') dx = -dxNorm;
      if (event.key === 'ArrowRight') dx = dxNorm;
      if (event.key === 'ArrowUp') dy = -dyNorm;
      if (event.key === 'ArrowDown') dy = dyNorm;

      const rect = editor.selectedRegion!.rect;
      const nextX = Math.max(0, Math.min(1 - rect.width, rect.x + dx));
      const nextY = Math.max(0, Math.min(1 - rect.height, rect.y + dy));

      if (Math.abs(nextX - rect.x) > 1e-6 || Math.abs(nextY - rect.y) > 1e-6) {
        void editor.updateRegionRect(editor.selectedRegion!.id, {
          ...rect,
          x: nextX,
          y: nextY,
        });
      }
    };

    window.addEventListener('keydown', handleArrowNudge);
    return () => window.removeEventListener('keydown', handleArrowNudge);
  }, [editor.selectedRegion, editor.updateRegionRect, width, height, busy, compareOriginal]);

  const getTransformCursor = () => {
    if (!activeTransform) return undefined;
    if (activeTransform.type === 'move') return 'grabbing';
    if (activeTransform.type === 'nw' || activeTransform.type === 'se') return 'nwse-resize';
    return 'nesw-resize';
  };

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
          style={{ width, height, cursor: getTransformCursor() }} onPointerDown={pointerDown}
          onPointerMove={event => { if (drag) setDrag(previous => previous ? { ...previous, end: pointFor(event) } : null); }}
          onPointerUp={pointerUp} onPointerCancel={() => setDrag(null)}>
          <img ref={imgRef} src={image} alt={`PDF 第 ${editor.page + 1} 页`} draggable={false} onLoad={() => setLoadedImage(image)} onError={editor.imageFailed} />
          {imageReady && !compareOriginal ? editor.regions.map(region => {
            const selected = editor.selectedId === region.id;
            if (!selected && !showRegions) return null;
            const isTransforming = activeTransform?.id === region.id;
            const displayRect = isTransforming ? activeTransform.currentRect : region.rect;
            return <button key={region.id} type="button" className={`text-region ${selected ? 'selected' : ''} ${isTransforming ? 'is-transforming' : ''} ${editor.edits.some(edit => edit.id === region.id) ? 'modified' : ''}`}
              style={rectStyle(displayRect)} aria-label={`选择文字：${region.text || '手动框选区域'}`} title={region.text || '手动框选区域'}
              disabled={busy || tool === 'region'} onPointerDown={event => startTransform(event, 'move', region)} onClick={() => editor.select(region.id)}>
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
