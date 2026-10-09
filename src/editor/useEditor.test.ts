import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../api';
import { useEditor } from '../useEditor';
import type { PDFDocument, TextEdit, TextRegion } from './types';
vi.mock('../api', () => ({
  api: { demo: vi.fn(), upload: vi.fn(), recognize: vi.fn(), close: vi.fn().mockResolvedValue(undefined), preview: vi.fn(), export: vi.fn(), save: vi.fn().mockResolvedValue(true), imageUrl: (id: string, page: number) => `/image/${id}/${page}` },
  errorMessage: (error: unknown) => error instanceof Error ? error.message : 'failure',
}));
const doc: PDFDocument = { id: 'doc', filename: 'label.pdf', page_count: 2, pages: [0, 1].map(index => ({ index, width_pt: 200, height_pt: 100, width_mm: 70, height_mm: 40, rotation: 0, preview_url: `/image/doc/${index}` })) };
const region: TextRegion = { id: 'ocr-1', page: 0, text: 'Date', rect: { x: 0.1, y: 0.1, width: 0.3, height: 0.2 }, font_size: 8, bold: false, confidence: 1, source: 'ocr' };
const editFor = (selected: TextRegion): TextEdit => ({ ...selected, text: 'Updated', font_family: 'Arial', text_color: '#000000', background_color: '#ffffff', fit: true });
beforeEach(() => {
  vi.mocked(api.demo).mockResolvedValue(doc);
  vi.mocked(api.recognize).mockImplementation(async (_id, page) => ({ regions: [{ ...region, page }], engine: 'test', elapsed_ms: 0, warnings: [] }));
  vi.mocked(api.preview).mockResolvedValue(new Blob(['preview']));
  vi.mocked(api.export).mockResolvedValue(new Blob(['pdf']));
  let serial = 0;
  URL.createObjectURL = vi.fn(() => `blob:preview-${++serial}`);
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });
async function opened() {
  const hook = renderHook(useEditor);
  await act(async () => { await hook.result.current.openDemo(); });
  return hook;
}
describe('editor lifecycle', () => {
  it('groups repeated movement into one undo and restores the saved box', async () => {
    const { result } = await opened();
    const selected = result.current.selectedRegion!;
    await act(async () => { await result.current.apply(editFor(selected)); });
    vi.useFakeTimers();
    act(() => {
      result.current.updateRegionRect(selected.id, { ...selected.rect, x: 0.12 });
      result.current.updateRegionRect(selected.id, { ...selected.rect, x: 0.14 });
    });
    await act(async () => { await vi.advanceTimersByTimeAsync(150); });
    expect(result.current.edits[0].rect.x).toBe(0.14);
    expect(result.current.history).toHaveLength(2);
    await act(async () => { await result.current.undo(); });
    expect(result.current.edits[0].rect).toEqual(selected.rect);
    expect(result.current.selectedRegion!.rect).toEqual(selected.rect);
    expect(URL.revokeObjectURL).toHaveBeenCalled();
  });
  it('flushes movement before exporting or changing page', async () => {
    const { result } = await opened();
    const selected = result.current.selectedRegion!;
    await act(async () => { await result.current.apply(editFor(selected)); });
    vi.useFakeTimers();
    act(() => { result.current.updateRegionRect(selected.id, { ...selected.rect, x: 0.2 }); });
    await act(async () => { await result.current.exportPDF(); });
    expect(vi.mocked(api.export).mock.lastCall![1][0].rect.x).toBe(0.2);
    act(() => { result.current.updateRegionRect(selected.id, { ...selected.rect, x: 0.25 }); });
    await act(async () => { await result.current.changePage(1); });
    expect(result.current.page).toBe(1);
    expect(result.current.edits[0].rect.x).toBe(0.25);
    expect(result.current.previewUrl).toBe('/image/doc/1');
  });
  it('ignores a preview response from a replaced document', async () => {
    const { result } = await opened();
    let resolve!: (blob: Blob) => void;
    vi.mocked(api.preview).mockReturnValueOnce(new Promise(done => { resolve = done; }));
    let applying!: Promise<boolean>;
    await act(async () => { applying = result.current.apply(editFor(result.current.selectedRegion!)); });
    vi.mocked(api.demo).mockResolvedValue({ ...doc, id: 'new-doc' });
    await act(async () => { await result.current.openDemo(); });
    await act(async () => { resolve(new Blob(['old'])); await applying; });
    expect(result.current.document!.id).toBe('new-doc');
    expect(result.current.previewUrl).toBe('/image/new-doc/0');
    expect(result.current.edits).toEqual([]);
    expect(result.current.operation).toBeNull();
  });
  it('rolls back optimistic movement when rendering fails', async () => {
    const { result } = await opened();
    const selected = result.current.selectedRegion!;
    await act(async () => { await result.current.apply(editFor(selected)); });
    vi.mocked(api.preview).mockRejectedValueOnce(new Error('render failed'));
    vi.useFakeTimers();
    act(() => { result.current.updateRegionRect(selected.id, { ...selected.rect, x: 0.2 }); });
    await act(async () => { await vi.advanceTimersByTimeAsync(150); });
    expect(result.current.edits[0].rect).toEqual(selected.rect);
    expect(result.current.selectedRegion!.rect).toEqual(selected.rect);
    expect(result.current.history).toHaveLength(1);
    expect(result.current.error).toContain('render failed');
  });
});
