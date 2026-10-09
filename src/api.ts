import type { PDFDocument, Recognition, TextEdit, Language } from './editor/types';
export type * from './editor/types';

async function native<T>(method: string, args?: unknown): Promise<T> {
  if (!window.commercePlugin) throw new Error('请从工具中心打开 LabelEdit。');
  return window.commercePlugin.invoke<T>('services.call', { service: 'labeledit.pdf', method, args });
}
function nativeBlob(value: { data: string; mime: string }) {
  const bytes = Uint8Array.from(atob(value.data), char => char.charCodeAt(0));
  return new Blob([bytes], { type: value.mime });
}
function imageUrl(id: string, page: number) {
  if (!window.commercePlugin) throw new Error('请从工具中心打开 LabelEdit。');
  return `commerce-plugin://${window.commercePlugin.id}/api/documents/${encodeURIComponent(id)}/pages/${page}/image`;
}
function describe(doc: PDFDocument): PDFDocument {
  return { ...doc, pages: doc.pages.map(page => ({ ...page, preview_url: imageUrl(doc.id, page.index) })) };
}

export const api = {
  async upload(file: File): Promise<PDFDocument> {
    if (file.size > 25 * 1024 * 1024) throw new Error('PDF 文件不能超过 25 MB。');
    const bytes = new Uint8Array(await file.arrayBuffer());
    let binary = '';
    for (let i = 0; i < bytes.length; i += 65536) binary += String.fromCharCode(...bytes.subarray(i, i + 65536));
    return describe(await native<PDFDocument>('upload', { filename: file.name, data: btoa(binary) }));
  },
  async demo(): Promise<PDFDocument> { return describe(await native<PDFDocument>('demo')); },
  async close(id: string): Promise<void> { await native('close', { id }); },
  recognize: (id: string, page: number, language: Language) => native<Recognition>('recognize', { id, page, language }),
  async preview(id: string, page: number, edits: TextEdit[]): Promise<Blob> {
    return nativeBlob(await native('preview', { id, page, edits }));
  },
  async export(id: string, edits: TextEdit[]): Promise<Blob> {
    return nativeBlob(await native('export', { id, edits }));
  },
  async save(blob: Blob, filename: string): Promise<boolean> {
    if (!window.commercePlugin) throw new Error('请从工具中心保存文件。');
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = '';
    for (let i = 0; i < bytes.length; i += 65536) binary += String.fromCharCode(...bytes.subarray(i, i + 65536));
    const token = await window.commercePlugin.invoke<{ token: string }>('files.create', { data: btoa(binary), filename, mime: 'application/pdf' });
    return window.commercePlugin.invoke<boolean>('files.save', { token: token.token, filename });
  },
  imageUrl,
};

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '操作未完成，请重试。';
}
