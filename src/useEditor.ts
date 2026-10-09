import { useCallback, useEffect, useReducer, useRef } from 'react';
import { api, errorMessage } from './api';
import { editorReducer, initialEditorState, isBusy, snapshotOf, type EditorAction, type EditSnapshot } from './editor/state';
import { acceptsEditorShortcut } from './editor/shortcuts';
import { usePreviewResources } from './editor/usePreviewResources';
import type { PDFDocument, TextEdit, Language, Rect, TextRegion } from './editor/types';

interface PendingMove { documentId: string; page: number; snapshot: EditSnapshot }

export function useEditor() {
  const [state, dispatch] = useReducer(editorReducer, initialEditorState);
  const current = useRef(state);
  current.current = state;
  // Keep actions coherent even when React batches repeated keyboard/pointer events.
  const send = useCallback((action: EditorAction) => {
    current.current = editorReducer(current.current, action);
    dispatch(action);
  }, []);
  const { request: previewFor, invalidate: invalidatePreview } = usePreviewResources(state.previewUrl);
  const openGeneration = useRef(0);
  const moveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingMove = useRef<PendingMove | null>(null);
  const clearMoveTimer = useCallback(() => {
    if (moveTimer.current !== null) clearTimeout(moveTimer.current);
    moveTimer.current = null;
  }, []);
  const isCurrent = (id: string, generation: number) => current.current.document?.id === id && openGeneration.current === generation;

  useEffect(() => () => {
    ++openGeneration.current;
    clearMoveTimer();
    pendingMove.current = null;
    const doc = current.current.document;
    if (doc) void api.close(doc.id).catch(() => {});
  }, [clearMoveTimer]);

  async function recognizeDocument(doc: PDFDocument, page: number, language: Language, generation = openGeneration.current) {
    send({ type: 'patch', patch: { operation: 'recognizing' } });
    try {
      const result = await api.recognize(doc.id, page, language);
      if (isCurrent(doc.id, generation)) send({ type: 'recognized', page, result, batch: crypto.randomUUID() });
    } catch (failure) {
      if (isCurrent(doc.id, generation)) send({ type: 'patch', patch: { error: `文字识别未完成：${errorMessage(failure)} 可使用「框选区域」手动修改。` } });
    } finally {
      if (isCurrent(doc.id, generation)) send({ type: 'patch', patch: { operation: null } });
    }
  }

  async function open(loader: () => Promise<PDFDocument>) {
    const generation = ++openGeneration.current;
    clearMoveTimer();
    if (pendingMove.current) send({ type: 'patch', patch: pendingMove.current.snapshot });
    pendingMove.current = null;
    invalidatePreview();
    send({ type: 'patch', patch: { operation: 'opening', error: null, notice: null } });
    try {
      const doc = await loader();
      if (generation !== openGeneration.current) {
        if (current.current.document?.id !== doc.id) void api.close(doc.id).catch(() => {});
        return;
      }
      const previous = current.current.document;
      send({ type: 'opened', document: doc, previewUrl: api.imageUrl(doc.id, 0) });
      if (previous && previous.id !== doc.id) void api.close(previous.id).catch(() => {});
      await recognizeDocument(doc, 0, current.current.language, generation);
    } catch (failure) {
      if (generation === openGeneration.current) send({ type: 'patch', patch: { error: `PDF 打开失败：${errorMessage(failure)}`, operation: null } });
    }
  }

  async function upload(file: File) {
    if (!/\.pdf$/i.test(file.name)) {
      send({ type: 'patch', patch: { error: '请选择 PDF 文件。' } });
      return;
    }
    await open(() => api.upload(file));
  }

  async function flushMoves(): Promise<boolean> {
    clearMoveTimer();
    const pending = pendingMove.current;
    pendingMove.current = null;
    if (!pending) return true;
    const { document, edits } = current.current;
    if (!document || pending.documentId !== document.id) return false;
    const generation = openGeneration.current;
    send({ type: 'patch', patch: { operation: 'applying', error: null } });
    try {
      const url = await previewFor(document, pending.page, edits);
      if (!url || !isCurrent(document.id, generation)) return false;
      send({ type: 'commit', edits, snapshot: pending.snapshot, previewUrl: url, notice: '文字位置已更新，预览与导出使用相同的排版。' });
      return true;
    } catch (failure) {
      if (isCurrent(document.id, generation)) send({ type: 'patch', patch: { ...pending.snapshot, error: `位置更新未完成：${errorMessage(failure)}` } });
      return false;
    } finally {
      if (isCurrent(document.id, generation)) send({ type: 'patch', patch: { operation: null } });
    }
  }

  async function recognize() {
    if (isBusy(current.current) || !await flushMoves()) return;
    const { document, page, language } = current.current;
    if (!document) return;
    send({ type: 'patch', patch: { error: null, notice: null } });
    await recognizeDocument(document, page, language);
  }

  async function commitEdits(nextEdits: TextEdit[], notice: string, failurePrefix: string): Promise<boolean> {
    const before = current.current;
    if (!before.document || isBusy(before)) return false;
    const generation = openGeneration.current;
    send({ type: 'patch', patch: { operation: 'applying', error: null, notice: null } });
    try {
      const url = await previewFor(before.document, before.page, nextEdits);
      if (!url || !isCurrent(before.document.id, generation)) return false;
      send({ type: 'commit', edits: nextEdits, snapshot: snapshotOf(before), previewUrl: url, notice });
      return true;
    } catch (failure) {
      if (isCurrent(before.document.id, generation)) send({ type: 'patch', patch: { error: `${failurePrefix}：${errorMessage(failure)}` } });
      return false;
    } finally {
      if (isCurrent(before.document.id, generation)) send({ type: 'patch', patch: { operation: null } });
    }
  }

  async function apply(edit: TextEdit) {
    if (isBusy(current.current) || !await flushMoves()) return false;
    return commitEdits([...current.current.edits.filter(item => item.id !== edit.id), edit], '修改已应用，预览与导出使用相同的排版。', '修改未应用');
  }

  async function undo() {
    if (isBusy(current.current) || !await flushMoves()) return;
    const before = current.current;
    const previous = before.history.at(-1);
    if (!before.document || !previous) return;
    const generation = openGeneration.current;
    send({ type: 'patch', patch: { operation: 'applying', error: null } });
    try {
      const url = await previewFor(before.document, before.page, previous.edits);
      if (url && isCurrent(before.document.id, generation)) send({ type: 'undo', snapshot: previous, previewUrl: url });
    } catch (failure) {
      if (isCurrent(before.document.id, generation)) send({ type: 'patch', patch: { error: `撤销未完成：${errorMessage(failure)}` } });
    } finally {
      if (isCurrent(before.document.id, generation)) send({ type: 'patch', patch: { operation: null } });
    }
  }

  async function remove(id: string) {
    if (isBusy(current.current) || !await flushMoves()) return;
    const before = current.current;
    if (!before.edits.some(edit => edit.id === id)) {
      send({ type: 'patch', patch: { regionsByPage: { ...before.regionsByPage, [before.page]: (before.regionsByPage[before.page] ?? []).filter(region => region.id !== id) }, selectedId: null } });
      return;
    }
    await commitEdits(before.edits.filter(edit => edit.id !== id), '已移除这项修改。', '移除未完成');
  }

  async function changePage(page: number) {
    if (isBusy(current.current) || !await flushMoves()) return;
    const before = current.current;
    if (!before.document || page === before.page || page < 0 || page >= before.document.page_count) return;
    const doc = before.document;
    const generation = openGeneration.current;
    send({ type: 'patch', patch: { page, selectedId: before.regionsByPage[page]?.[0]?.id ?? null, previewUrl: api.imageUrl(doc.id, page), error: null, notice: null, previewLoading: true } });
    try {
      const url = await previewFor(doc, page, before.edits);
      if (url && isCurrent(doc.id, generation)) send({ type: 'patch', patch: { previewUrl: url } });
    } catch (failure) {
      if (isCurrent(doc.id, generation)) send({ type: 'patch', patch: { error: `页面预览未完成：${errorMessage(failure)}` } });
    } finally {
      if (isCurrent(doc.id, generation)) send({ type: 'patch', patch: { previewLoading: false } });
    }
    if (isCurrent(doc.id, generation) && !current.current.recognitionByPage[page]) await recognizeDocument(doc, page, before.language, generation);
  }

  function addManualRegion(rect: Rect) {
    const before = current.current;
    if (!before.document || isBusy(before)) return;
    const region: TextRegion = { id: `manual-${crypto.randomUUID()}`, page: before.page, rect, text: '', confidence: 1,
      font_size: Math.max(1, Math.min(12, before.document.pages[before.page].height_pt * rect.height * 0.72)), bold: false, source: 'manual' };
    send({ type: 'patch', patch: { regionsByPage: { ...before.regionsByPage, [before.page]: [...(before.regionsByPage[before.page] ?? []), region] }, selectedId: region.id,
      notice: '已框选区域，在右侧输入替换文字。留空可清除区域内容。' } });
  }

  function updateRegionRect(id: string, rect: Rect) {
    const before = current.current;
    if (!before.document || isBusy(before) || !(before.regionsByPage[before.page] ?? []).some(region => region.id === id)) return;
    if (before.edits.some(edit => edit.id === id) && !pendingMove.current) pendingMove.current = { documentId: before.document.id, page: before.page, snapshot: snapshotOf(before) };
    send({ type: 'rect', id, page: before.page, rect });
    if (pendingMove.current) {
      clearMoveTimer();
      moveTimer.current = setTimeout(() => { void flushMoves(); }, 150);
    }
  }

  async function exportPDF() {
    if (isBusy(current.current) || !await flushMoves()) return;
    const before = current.current;
    if (!before.document) return;
    const generation = openGeneration.current;
    send({ type: 'patch', patch: { operation: 'exporting', error: null, notice: null } });
    try {
      const exported = await api.export(before.document.id, before.edits);
      if (!isCurrent(before.document.id, generation)) return;
      const filename = before.document.filename.replace(/\.pdf$/i, '') + ' - 已编辑.pdf';
      const saved = await api.save(exported, filename);
      if (isCurrent(before.document.id, generation)) send({ type: 'patch', patch: { notice: saved ? 'PDF 已保存。' : '已取消保存 PDF。' } });
    } catch (failure) {
      if (isCurrent(before.document.id, generation)) send({ type: 'patch', patch: { error: `PDF 导出失败：${errorMessage(failure)}` } });
    } finally {
      if (isCurrent(before.document.id, generation)) send({ type: 'patch', patch: { operation: null } });
    }
  }

  const undoRef = useRef(undo);
  undoRef.current = undo;
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (acceptsEditorShortcut(event) && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z' && !event.shiftKey) {
        event.preventDefault();
        void undoRef.current();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const regions = state.regionsByPage[state.page] ?? [];
  return {
    ...state, regions, selectedRegion: regions.find(region => region.id === state.selectedId) ?? null,
    selectedEdit: state.edits.find(edit => edit.id === state.selectedId), recognition: state.recognitionByPage[state.page], canUndo: state.history.length > 0,
    busy: isBusy(state), upload, openDemo: () => open(api.demo), recognize, apply, undo, remove, changePage, addManualRegion, exportPDF, updateRegionRect,
    select: (selectedId: string | null) => send({ type: 'patch', patch: { selectedId } }),
    setLanguage: (language: Language) => send({ type: 'patch', patch: { language } }),
    clearError: () => send({ type: 'patch', patch: { error: null } }), clearNotice: () => send({ type: 'patch', patch: { notice: null } }),
    imageFailed: () => send({ type: 'patch', patch: { error: '页面图片加载失败，请重新打开 PDF 或检查本机服务。' } }),
  };
}
export type Editor = ReturnType<typeof useEditor>;
