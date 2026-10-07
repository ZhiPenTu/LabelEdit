import { useEffect, useRef, useState } from 'react';
import { api, errorMessage, type Language, type PDFDocument, type Recognition, type Rect, type TextEdit, type TextRegion } from './api';

type Operation = 'opening' | 'recognizing' | 'applying' | 'exporting' | null;

function overlaps(first: Rect, second: Rect): boolean {
  const width = Math.max(0, Math.min(first.x + first.width, second.x + second.width) - Math.max(first.x, second.x));
  const height = Math.max(0, Math.min(first.y + first.height, second.y + second.height) - Math.max(first.y, second.y));
  return width * height > Math.min(first.width * first.height, second.width * second.height) * 0.65;
}

export function useEditor() {
  const [document, setDocument] = useState<PDFDocument | null>(null);
  const [page, setPage] = useState(0);
  const [regionsByPage, setRegionsByPage] = useState<Record<number, TextRegion[]>>({});
  const [recognitionByPage, setRecognitionByPage] = useState<Record<number, Recognition>>({});
  const [edits, setEdits] = useState<TextEdit[]>([]);
  const [history, setHistory] = useState<TextEdit[][]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [language, setLanguage] = useState<Language>('latin');
  const [operation, setOperation] = useState<Operation>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [download, setDownload] = useState<{ url: string; filename: string } | null>(null);
  const documentRef = useRef<PDFDocument | null>(null);
  const imageRequest = useRef(0);
  const openRequest = useRef(0);
  const editsRef = useRef(edits);
  const regionsRef = useRef(regionsByPage);
  const nudgeTimerRef = useRef<number | null>(null);
  const pendingEditsRef = useRef<TextEdit[] | null>(null);
  const historySnapshotRef = useRef<TextEdit[] | null>(null);
  editsRef.current = edits;
  regionsRef.current = regionsByPage;

  useEffect(() => () => {
    if (previewUrl?.startsWith('blob:')) URL.revokeObjectURL(previewUrl);
    if (nudgeTimerRef.current) window.clearTimeout(nudgeTimerRef.current);
  }, [previewUrl]);

  useEffect(() => {
    const handleUndo = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if ((event.ctrlKey || event.metaKey) && event.key === 'z' && !event.shiftKey &&
          !['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) && !target.isContentEditable) {
        event.preventDefault();
        if (history.length && !operation && !previewLoading) void undo();
      }
    };
    window.addEventListener('keydown', handleUndo);
    return () => window.removeEventListener('keydown', handleUndo);
  });

  async function recognizeDocument(doc: PDFDocument, targetPage: number, targetLanguage: Language) {
    setOperation('recognizing');
    try {
      const result = await api.recognize(doc.id, targetPage, targetLanguage);
      if (documentRef.current?.id !== doc.id) return;
      // Detection index IDs may change between language models. Give each run its
      // own IDs and keep edited boxes so an existing edit can never move silently.
      const batch = crypto.randomUUID();
      const detected = result.regions.map(region => ({ ...region, id: `${batch}:${region.id}` }));
      const editedIds = new Set(editsRef.current.map(edit => edit.id));
      const preserved = (regionsRef.current[targetPage] ?? []).filter(region => region.source === 'manual' || editedIds.has(region.id));
      const fresh = detected.filter(region => !preserved.some(old => old.source !== 'manual' && overlaps(region.rect, old.rect)));
      const nextRegions = [...fresh, ...preserved];
      setRegionsByPage(previous => ({ ...previous, [targetPage]: nextRegions }));
      setRecognitionByPage(previous => ({ ...previous, [targetPage]: result }));
      setSelectedId(previous => nextRegions.some(region => region.id === previous) ? previous : nextRegions[0]?.id ?? null);
      if (!result.regions.length) setNotice('未识别到文字。可以使用「框选区域」手动添加修改。');
      else if (result.warnings?.length) setNotice(result.warnings.join('；'));
      else setNotice(null);
    } catch (failure) {
      if (documentRef.current?.id === doc.id) {
        setError(`文字识别未完成：${errorMessage(failure)} 可使用「框选区域」手动修改。`);
      }
    } finally {
      if (documentRef.current?.id === doc.id) setOperation(null);
    }
  }

  async function open(loader: () => Promise<PDFDocument>) {
    const request = ++openRequest.current;
    setOperation('opening');
    setError(null);
    setNotice(null);
    setDownload(null);
    try {
      const doc = await loader();
      if (request !== openRequest.current) return;
      const previousDocument = documentRef.current;
      documentRef.current = doc;
      ++imageRequest.current;
      setDocument(doc);
      setPage(0);
      setRegionsByPage({});
      setRecognitionByPage({});
      setEdits([]);
      setHistory([]);
      setSelectedId(null);
      setPreviewUrl(api.imageUrl(doc.id, 0));
      setPreviewLoading(false);
      if (previousDocument && previousDocument.id !== doc.id) {
        void api.close(previousDocument.id).catch(() => { /* A cleanup failure must not interrupt the newly opened document. */ });
      }
      await recognizeDocument(doc, 0, language);
    } catch (failure) {
      if (request === openRequest.current) {
        setError(`PDF 打开失败：${errorMessage(failure)}`);
        setOperation(null);
      }
    }
  }

  async function upload(file: File) {
    if (!/\.pdf$/i.test(file.name)) {
      setError('请选择 PDF 文件。');
      return;
    }
    await open(() => api.upload(file));
  }

  async function recognize() {
    if (!document || operation || previewLoading) return;
    setError(null);
    setNotice(null);
    await recognizeDocument(document, page, language);
  }

  async function previewFor(nextEdits: TextEdit[], targetPage = page): Promise<string | null> {
    if (!document) return null;
    const request = ++imageRequest.current;
    const docId = document.id;
    if (!nextEdits.some(edit => edit.page === targetPage)) return api.imageUrl(docId, targetPage);
    const blob = await api.preview(docId, targetPage, nextEdits);
    if (request !== imageRequest.current || documentRef.current?.id !== docId) return null;
    return URL.createObjectURL(blob);
  }

  async function apply(edit: TextEdit) {
    if (!document || operation || previewLoading) return false;
    if (nudgeTimerRef.current) {
      window.clearTimeout(nudgeTimerRef.current);
      nudgeTimerRef.current = null;
    }
    pendingEditsRef.current = null;
    historySnapshotRef.current = null;
    setOperation('applying');
    setError(null);
    setNotice(null);
    const nextEdits = [...edits.filter(item => item.id !== edit.id), edit];
    try {
      const url = await previewFor(nextEdits);
      if (!url) return false;
      setHistory(previous => [...previous, edits]);
      setEdits(nextEdits);
      setDownload(null);
      setPreviewUrl(url);
      setNotice('修改已应用，预览与导出使用相同的排版。');
      return true;
    } catch (failure) {
      setError(`修改未应用：${errorMessage(failure)}`);
      return false;
    } finally { setOperation(null); }
  }

  async function undo() {
    if (!history.length || operation || previewLoading) return;
    if (nudgeTimerRef.current) {
      window.clearTimeout(nudgeTimerRef.current);
      nudgeTimerRef.current = null;
    }
    pendingEditsRef.current = null;
    historySnapshotRef.current = null;
    setOperation('applying');
    setError(null);
    try {
      const previous = history[history.length - 1];
      const url = await previewFor(previous);
      if (!url) return;
      setEdits(previous);
      setRegionsByPage(prev => {
        const currentList = prev[page] ?? [];
        let changed = false;
        const nextList = currentList.map(region => {
          const matchingEdit = previous.find(e => e.id === region.id && e.page === page);
          if (matchingEdit && (
            matchingEdit.rect.x !== region.rect.x ||
            matchingEdit.rect.y !== region.rect.y ||
            matchingEdit.rect.width !== region.rect.width ||
            matchingEdit.rect.height !== region.rect.height
          )) {
            changed = true;
            return { ...region, rect: matchingEdit.rect };
          }
          return region;
        });
        return changed ? { ...prev, [page]: nextList } : prev;
      });
      setDownload(null);
      setHistory(items => items.slice(0, -1));
      setPreviewUrl(url);
      setNotice('已撤销上一次修改。');
    } catch (failure) { setError(`撤销未完成：${errorMessage(failure)}`); }
    finally { setOperation(null); }
  }

  async function remove(id: string) {
    if (operation || previewLoading) return;
    if (nudgeTimerRef.current) {
      window.clearTimeout(nudgeTimerRef.current);
      nudgeTimerRef.current = null;
    }
    pendingEditsRef.current = null;
    historySnapshotRef.current = null;
    const hasEdit = edits.some(edit => edit.id === id);
    if (!hasEdit) {
      setRegionsByPage(previous => ({ ...previous, [page]: (previous[page] ?? []).filter(region => region.id !== id) }));
      setSelectedId(null);
      return;
    }
    setOperation('applying');
    setError(null);
    try {
      const nextEdits = edits.filter(edit => edit.id !== id);
      const url = await previewFor(nextEdits);
      if (!url) return;
      setHistory(previous => [...previous, edits]);
      setEdits(nextEdits);
      setDownload(null);
      setPreviewUrl(url);
      setNotice('已移除这项修改。');
    } catch (failure) { setError(`移除未完成：${errorMessage(failure)}`); }
    finally { setOperation(null); }
  }

  async function changePage(nextPage: number) {
    if (!document || operation || previewLoading || nextPage === page || nextPage < 0 || nextPage >= document.page_count) return;
    setPage(nextPage);
    setSelectedId(regionsByPage[nextPage]?.[0]?.id ?? null);
    setPreviewUrl(api.imageUrl(document.id, nextPage));
    setError(null);
    setNotice(null);
    setPreviewLoading(true);
    try {
      const url = await previewFor(edits, nextPage);
      if (url) setPreviewUrl(url);
    } catch (failure) { setError(`页面预览未完成：${errorMessage(failure)}`); }
    finally { setPreviewLoading(false); }
    if (!recognitionByPage[nextPage]) await recognizeDocument(document, nextPage, language);
  }

  function addManualRegion(rect: Rect) {
    if (!document || operation || previewLoading) return;
    setDownload(null);
    const id = `manual-${crypto.randomUUID()}`;
    const region: TextRegion = {
      id, page, rect, text: '', confidence: 1,
      font_size: Math.max(1, Math.min(12, document.pages[page].height_pt * rect.height * 0.72)),
      bold: false, source: 'manual',
    };
    setRegionsByPage(previous => ({ ...previous, [page]: [...(previous[page] ?? []), region] }));
    setSelectedId(id);
    setNotice('已框选区域，在右侧输入替换文字。留空可清除区域内容。');
  }

  async function updateRegionRect(id: string, rect: Rect) {
    if (!document) return;
    setRegionsByPage(previous => {
      const currentList = previous[page] ?? [];
      const index = currentList.findIndex(r => r.id === id);
      if (index === -1) return previous;
      const updated = [...currentList];
      updated[index] = { ...updated[index], rect };
      return { ...previous, [page]: updated };
    });

    const existingEdit = editsRef.current.find(edit => edit.id === id);
    if (!existingEdit) return;

    if (!historySnapshotRef.current) {
      historySnapshotRef.current = editsRef.current;
    }

    const updatedEdit = { ...existingEdit, rect };
    const nextEdits = [...editsRef.current.filter(item => item.id !== id), updatedEdit];
    setEdits(nextEdits);
    pendingEditsRef.current = nextEdits;

    if (nudgeTimerRef.current) {
      window.clearTimeout(nudgeTimerRef.current);
    }

    nudgeTimerRef.current = window.setTimeout(async () => {
      nudgeTimerRef.current = null;
      const toApply = pendingEditsRef.current;
      const snapshot = historySnapshotRef.current;
      pendingEditsRef.current = null;
      historySnapshotRef.current = null;
      if (!toApply || !snapshot) return;

      setOperation('applying');
      setError(null);
      try {
        const url = await previewFor(toApply);
        if (!url) return;
        setHistory(previous => [...previous, snapshot]);
        setPreviewUrl(url);
        setDownload(null);
        setNotice('文字位置已更新，预览与导出使用相同的排版。');
      } catch (failure) {
        setError(`位置更新未完成：${errorMessage(failure)}`);
      } finally {
        setOperation(null);
      }
    }, 150);
  }

  async function exportPDF() {
    if (!document || operation || previewLoading) return;
    setOperation('exporting');
    setError(null);
    setNotice(null);
    setDownload(null);
    try {
      await api.export(document.id, edits);
      const url = api.downloadUrl(document.id);
      const filename = document.filename.replace(/\.pdf$/i, '') + ' - 已编辑.pdf';
      setDownload({ url, filename });
      const anchor = window.document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      window.document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setNotice('PDF 已生成。若下载未开始，可点击下方链接。');
    } catch (failure) { setError(`PDF 导出失败：${errorMessage(failure)}`); }
    finally { setOperation(null); }
  }

  const regions = regionsByPage[page] ?? [];
  const selectedRegion = regions.find(region => region.id === selectedId) ?? null;

  return {
    document, page, regions, edits, selectedId, selectedRegion,
    selectedEdit: edits.find(edit => edit.id === selectedId),
    language, setLanguage, operation, previewUrl, previewLoading, error, notice, download,
    recognition: recognitionByPage[page], canUndo: history.length > 0,
    upload, openDemo: () => open(api.demo), recognize, select: setSelectedId,
    apply, undo, remove, changePage, addManualRegion, exportPDF, updateRegionRect,
    clearError: () => setError(null), clearNotice: () => setNotice(null),
    invalidateDownload: () => { if (download) { setDownload(null); setNotice(null); } },
    imageFailed: () => setError('页面图片加载失败，请重新打开 PDF 或检查本机服务。'),
  };
}

export type Editor = ReturnType<typeof useEditor>;
