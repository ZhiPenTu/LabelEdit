import { isTauri, invoke } from "@tauri-apps/api/core";

let cachedBaseUrl: string | null = null;
let pendingBase: Promise<string> | null = null;

export interface SystemInfo {
  ready: boolean;
  tools: {
    rapidocr: string;
    onnxruntime: string;
    pypdfium2: string;
    pypdf: string;
    reportlab: string;
    fastapi?: string;
  };
  ocr: {
    ready: boolean;
    name: string;
    languages: string[];
    models?: Record<string, boolean>;
    model_directory?: string;
    local_only?: boolean;
  };
}

export const DEFAULT_SYSTEM_INFO: SystemInfo = {
  ready: true,
  tools: {
    rapidocr: "3.9.2",
    onnxruntime: "1.30.0",
    pypdfium2: "5.14.0",
    pypdf: "6.19.0",
    reportlab: "5.0.1",
    fastapi: "0.142.2",
  },
  ocr: {
    ready: true,
    name: "RapidOCR + ONNX Runtime CPU / PP-OCRv5 mobile",
    languages: ["latin", "chinese"],
    local_only: true,
  },
};

export async function getApiBase(): Promise<string> {
  if (cachedBaseUrl !== null) return cachedBaseUrl;
  if (isTauri()) {
    pendingBase ??= invoke<string>("get_backend_url").then(url => {
      cachedBaseUrl = url.replace(/\/+$/, "");
      return cachedBaseUrl;
    }).finally(() => { pendingBase = null; });
    return pendingBase;
  }
  cachedBaseUrl = "";
  return cachedBaseUrl;
}

export function getSyncApiBase(): string {
  if (cachedBaseUrl !== null) return cachedBaseUrl;
  if (isTauri()) return "http://127.0.0.1:8765";
  return "";
}

export async function checkBackendHealth(): Promise<{ ready: boolean; error?: string }> {
  try {
    const base = await getApiBase();
    const res = await fetch(`${base}/api/health`, { cache: "no-store", signal: AbortSignal.timeout(3000) });
    if (!res.ok) return { ready: false, error: `服务状态异常（${res.status}）` };
    const data = await res.json();
    return { ready: Boolean(data.ready) };
  } catch (e) {
    return { ready: false, error: e instanceof Error ? e.message : "无法连接到后端服务" };
  }
}

export async function getBackendSystemInfo(): Promise<SystemInfo> {
  try {
    const base = await getApiBase();
    const res = await fetch(`${base}/api/health`, { cache: "no-store", signal: AbortSignal.timeout(3000) });
    if (!res.ok) return DEFAULT_SYSTEM_INFO;
    const data = await res.json();
    return {
      ready: Boolean(data.ready),
      tools: {
        rapidocr: data.tools?.rapidocr || DEFAULT_SYSTEM_INFO.tools.rapidocr,
        onnxruntime: data.tools?.onnxruntime || DEFAULT_SYSTEM_INFO.tools.onnxruntime,
        pypdfium2: data.tools?.pypdfium2 || DEFAULT_SYSTEM_INFO.tools.pypdfium2,
        pypdf: data.tools?.pypdf || DEFAULT_SYSTEM_INFO.tools.pypdf,
        reportlab: data.tools?.reportlab || DEFAULT_SYSTEM_INFO.tools.reportlab,
        fastapi: data.tools?.fastapi,
      },
      ocr: {
        ready: Boolean(data.ocr?.ready),
        name: data.ocr?.name || DEFAULT_SYSTEM_INFO.ocr.name,
        languages: Array.isArray(data.ocr?.languages) ? data.ocr.languages : DEFAULT_SYSTEM_INFO.ocr.languages,
        models: data.ocr?.models,
        model_directory: data.ocr?.model_directory,
        local_only: data.ocr?.local_only ?? true,
      },
    };
  } catch {
    return DEFAULT_SYSTEM_INFO;
  }
}
