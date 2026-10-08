import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useTextDraft } from './useTextDraft';
import type { TextEdit, TextRegion } from './types';

afterEach(cleanup);
const region: TextRegion = { id: 'r1', page: 0, rect: { x: 0.1, y: 0.2, width: 0.3, height: 0.1 }, text: 'Original', font_size: 8, bold: false, confidence: 1, source: 'ocr' };
const saved: TextEdit = { ...region, font_family: 'Arial', text_color: '#000000', background_color: '#ffffff', fit: true };

describe('text drafts shared by desktop and side sheets', () => {
  it('preserves unsaved text and font changes across rect updates and unrelated renders', () => {
    const invalidate = vi.fn();
    const { result, rerender } = renderHook(({ selected, edit }) => useTextDraft('doc:0:r1', selected, edit, invalidate), { initialProps: { selected: region, edit: saved } });
    act(() => { result.current.update('text', 'Unsaved'); result.current.update('bold', true); });
    const moved = { ...region, rect: { ...region.rect, x: 0.4 } };
    rerender({ selected: moved, edit: { ...saved, rect: moved.rect } });
    rerender({ selected: moved, edit: { ...saved, rect: moved.rect } });
    expect(result.current.draft).toMatchObject({ text: 'Unsaved', bold: true, rect: moved.rect });
    expect(invalidate).toHaveBeenCalledTimes(2);
  });
  it('resets on selection and committed content changes, including undo', () => {
    const { result, rerender } = renderHook(({ key, selected, edit }) => useTextDraft(key, selected, edit, vi.fn()), { initialProps: { key: 'doc:0:r1', selected: region, edit: saved } });
    act(() => { result.current.update('text', 'Unsaved'); });
    rerender({ key: 'doc:0:r1', selected: region, edit: { ...saved, text: 'Committed' } });
    expect(result.current.draft!.text).toBe('Committed');
    rerender({ key: 'doc:0:r1', selected: region, edit: saved });
    expect(result.current.draft!.text).toBe('Original');
    rerender({ key: 'doc:1:r2', selected: { ...region, id: 'r2', page: 1 }, edit: { ...saved, id: 'r2', page: 1, text: 'Second' } });
    expect(result.current.draft).toMatchObject({ id: 'r2', page: 1, text: 'Second' });
  });
});
