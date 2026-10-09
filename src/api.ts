import { getApiBase, getSyncApiBase } from './platform/backend';
import type { PDFDocument, Recognition, TextEdit, Language } from './editor/types';
export type * from './editor/types';
export { getApiBase, getSyncApiBase, checkBackendHealth } from './platform/backend';

async function checked(response: Response): Promise<Response> {
  if (response.ok) return response;
  let message = `请求失败（${response.status}）`;
  try {
    const body = await response.json();
    const detail = body.detail ?? body.error ?? body.message;
    if (typeof detail === 'string') message = detail;
    else if (Array.isArray(detail)) message = detail.map((item: { msg?: string }) => item.msg ?? '').filter(Boolean).join('；') || message;
  } catch { /* Keep the HTTP status if the server returns a non-JSON response. */ }
  throw new Error(message);
}

async function jsonRequest<T>(path: string, options?: RequestInit): Promise<T> {
  const base = await getApiBase();
  const url = path.startsWith('http') ? path : `${base}${path}`;
  const response = await checked(await fetch(url, options));
  return response.json() as Promise<T>;
}

const jsonOptions = (body: unknown): RequestInit => ({
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});
const documentPath = (id: string) => `/api/documents/${encodeURIComponent(id)}`;
const native = <T>(method: string, args?: unknown) => window.commercePlugin!.invoke<T>('services.call', { service: 'labeledit.pdf', method, args });
function nativeBlob(value: { data: string; mime: string }) { const binary = atob(value.data); const bytes = Uint8Array.from(binary, char => char.charCodeAt(0)); return new Blob([bytes], { type: value.mime }); }

export const api = {
  async upload(file: File): Promise<PDFDocument> {
    if (window.commercePlugin) { const bytes = new Uint8Array(await file.arrayBuffer()); if (bytes.length > 25 * 1024 * 1024) throw new Error('PDF 文件不能超过 25 MB。'); let binary = ''; for (let i = 0; i < bytes.length; i += 65536) binary += String.fromCharCode(...bytes.subarray(i, i + 65536)); return api.fixDocumentUrls(await native<PDFDocument>('upload', { filename: file.name, data: btoa(binary) })); }
    const form = new FormData();
    form.append('file', file);
    const doc = await jsonRequest<PDFDocument>('/api/documents', { method: 'POST', body: form });
    return api.fixDocumentUrls(doc);
  },
  async demo(): Promise<PDFDocument> {
    if (window.commercePlugin) return api.fixDocumentUrls(await native<PDFDocument>('demo'));
    const doc = await jsonRequest<PDFDocument>('/api/demo', { method: 'POST' });
    return api.fixDocumentUrls(doc);
  },
  fixDocumentUrls(doc: PDFDocument): PDFDocument {
    const base = getSyncApiBase();
    return {
      ...doc,
      pages: doc.pages.map(page => ({
        ...page,
        preview_url: page.preview_url.startsWith('http') ? page.preview_url : `${base}${page.preview_url}`,
      })),
    };
  },
  async close(id: string): Promise<void> {
    if (window.commercePlugin) { await native('close', { id }); return; }
    const base = await getApiBase();
    await checked(await fetch(`${base}${documentPath(id)}`, { method: 'DELETE' }));
  },
  recognize: (id: string, page: number, language: Language) => window.commercePlugin ? native<Recognition>('recognize', { id, page, language }) :
    jsonRequest<Recognition>(`${documentPath(id)}/pages/${page}/recognize`, jsonOptions({ language })),
  async preview(id: string, page: number, edits: TextEdit[]): Promise<Blob> {
    if (window.commercePlugin) return nativeBlob(await native('preview', { id, page, edits }));
    const base = await getApiBase();
    return (await checked(await fetch(`${base}${documentPath(id)}/preview`, jsonOptions({ page, edits })))).blob();
  },
  async export(id: string, edits: TextEdit[]): Promise<Blob> {
    if (window.commercePlugin) return nativeBlob(await native('export', { id, edits }));
    const base = await getApiBase();
    return (await checked(await fetch(`${base}${documentPath(id)}/export`, jsonOptions({ edits })))).blob();
  },
  imageUrl: (id: string, page: number) => `${getSyncApiBase()}${documentPath(id)}/pages/${page}/image`,
  downloadUrl: (id: string) => `${getSyncApiBase()}${documentPath(id)}/download`,
};

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '操作未完成，请重试。';
}
