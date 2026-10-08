import { useCallback, useEffect, useRef } from 'react';
import { api } from '../api';
import type { PDFDocument, TextEdit } from './types';

export function usePreviewResources(currentUrl: string | null) {
  const generation = useRef(0);
  const owned = useRef(new Set<string>());
  const invalidate = useCallback(() => { generation.current += 1; }, []);
  useEffect(() => () => {
    if (currentUrl && owned.current.delete(currentUrl)) URL.revokeObjectURL(currentUrl);
  }, [currentUrl]);
  useEffect(() => () => {
    generation.current += 1;
    for (const url of owned.current) URL.revokeObjectURL(url);
    owned.current.clear();
  }, []);
  const request = useCallback(async (doc: PDFDocument, page: number, edits: TextEdit[]) => {
    const token = ++generation.current;
    if (!edits.some(edit => edit.page === page)) return api.imageUrl(doc.id, page);
    const blob = await api.preview(doc.id, page, edits);
    if (token !== generation.current) return null;
    const url = URL.createObjectURL(blob);
    owned.current.add(url);
    return url;
  }, []);
  return { request, invalidate };
}
