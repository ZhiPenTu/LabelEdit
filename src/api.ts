import { isTauri, invoke } from '@tauri-apps/api/core';

export interface Rect { x: number; y: number; width: number; height: number }
export interface PageInfo {
  index: number;
  width_pt: number;
  height_pt: number;
  width_mm: number;
  height_mm: number;
  rotation: number;
  preview_url: string;
}
export interface PDFDocument {
  id: string;
  filename: string;
  page_count: number;
  pages: PageInfo[];
}
export interface TextRegion {
  id: string;
  page: number;
  text: string;
  rect: Rect;
  confidence: number;
  font_size: number;
  bold: boolean;
  source: 'ocr' | 'native' | 'manual';
}
export interface TextEdit {
  id: string;
  page: number;
  rect: Rect;
  text: string;
  font_family: 'Arial' | 'Noto Sans SC';
  font_size: number;
  bold: boolean;
  text_color: string;
  background_color: string;
  fit: boolean;
}
export type Language = 'latin' | 'chinese';
export interface Recognition {
  regions: TextRegion[];
  engine: string;
  elapsed_ms: number;
  warnings: string[];
}

let cachedBaseUrl: string | null = null;

export async function getApiBase(): Promise<string> {
  if (cachedBaseUrl !== null) return cachedBaseUrl;
  if (isTauri()) {
    try {
      const url = await invoke<string>('get_backend_url');
      cachedBaseUrl = url.replace(/\/+$/, '');
      return cachedBaseUrl;
    } catch {
      cachedBaseUrl = 'http://127.0.0.1:8765';
      return cachedBaseUrl;
    }
  }
  cachedBaseUrl = '';
  return cachedBaseUrl;
}

export function getSyncApiBase(): string {
  if (cachedBaseUrl !== null) return cachedBaseUrl;
  if (isTauri()) return 'http://127.0.0.1:8765';
  return '';
}

export async function checkBackendHealth(): Promise<{ ready: boolean; error?: string }> {
  const base = await getApiBase();
  try {
    const res = await fetch(`${base}/api/health`, { cache: 'no-store' });
    if (!res.ok) return { ready: false, error: `服务状态异常（${res.status}）` };
    const data = await res.json();
    return { ready: Boolean(data.ready) };
  } catch (e) {
    return { ready: false, error: e instanceof Error ? e.message : '无法连接到后端服务' };
  }
}

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

export const api = {
  async upload(file: File): Promise<PDFDocument> {
    const form = new FormData();
    form.append('file', file);
    const doc = await jsonRequest<PDFDocument>('/api/documents', { method: 'POST', body: form });
    return api.fixDocumentUrls(doc);
  },
  async demo(): Promise<PDFDocument> {
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
    const base = await getApiBase();
    await checked(await fetch(`${base}${documentPath(id)}`, { method: 'DELETE' }));
  },
  recognize: (id: string, page: number, language: Language) =>
    jsonRequest<Recognition>(`${documentPath(id)}/pages/${page}/recognize`, jsonOptions({ language })),
  async preview(id: string, page: number, edits: TextEdit[]): Promise<Blob> {
    const base = await getApiBase();
    return (await checked(await fetch(`${base}${documentPath(id)}/preview`, jsonOptions({ page, edits })))).blob();
  },
  async export(id: string, edits: TextEdit[]): Promise<Blob> {
    const base = await getApiBase();
    return (await checked(await fetch(`${base}${documentPath(id)}/export`, jsonOptions({ edits })))).blob();
  },
  imageUrl: (id: string, page: number) => `${getSyncApiBase()}${documentPath(id)}/pages/${page}/image`,
  downloadUrl: (id: string) => `${getSyncApiBase()}${documentPath(id)}/download`,
};

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '操作未完成，请重试。';
}
