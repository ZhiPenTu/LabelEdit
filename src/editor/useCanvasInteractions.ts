import { useEffect, useRef, useState, type PointerEvent, type RefObject } from 'react';
import type { Editor } from '../useEditor';
import { rectangle, computeTransformedRect, type Point, type TransformType } from './geometry';
import { acceptsEditorShortcut } from './shortcuts';
import type { Rect, TextRegion, Tool } from './types';

interface ActiveTransform { id: string; type: TransformType; startX: number; startY: number; docWidth: number; docHeight: number; startRect: Rect; currentRect: Rect }
type CanvasActions = Pick<Editor, 'selectedId' | 'selectedRegion' | 'select' | 'updateRegionRect' | 'addManualRegion'>;
export function useCanvasInteractions({ editor, documentRef, tool, busy, imageReady, compareOriginal, width, height, image }: { editor: CanvasActions; documentRef: RefObject<HTMLDivElement | null>; tool: Tool; busy: boolean; imageReady: boolean; compareOriginal: boolean; width: number; height: number; image: string }) {
  const actions = useRef(editor);
  actions.current = editor;
  const [drag, setDrag] = useState<{ start: Point; end: Point } | null>(null);
  const [activeTransform, setActiveTransform] = useState<ActiveTransform | null>(null);
  const activeTransformRef = useRef<ActiveTransform | null>(null);
  activeTransformRef.current = activeTransform;
  useEffect(() => { setDrag(null); setActiveTransform(null); activeTransformRef.current = null; }, [image, tool]);
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
      actions.current.select(region.id);
    }

    const docEl = documentRef.current;
    if (!docEl) return;
    docEl.focus({ preventScroll: true });
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
        void actions.current.updateRegionRect(current.id, currentRect);
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
    const cancel = () => { activeTransformRef.current = null; setActiveTransform(null); };
    window.addEventListener('pointercancel', cancel);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', cancel);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [Boolean(activeTransform)]);

  useEffect(() => {
    if (!editor.selectedRegion || busy || compareOriginal) return;

    const handleArrowNudge = (event: KeyboardEvent) => {
      if (!acceptsEditorShortcut(event)) {
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
        void actions.current.updateRegionRect(editor.selectedRegion!.id, {
          ...rect,
          x: nextX,
          y: nextY,
        });
      }
    };

    window.addEventListener('keydown', handleArrowNudge);
    return () => window.removeEventListener('keydown', handleArrowNudge);
  }, [editor.selectedRegion, editor.updateRegionRect, width, height, busy, compareOriginal]);

  return { drag, setDrag, activeTransform, pointerDown, pointerUp, startTransform };
}
