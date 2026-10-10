export interface FileToken { token: string; name: string; size: number; mime: string }
export interface PluginBridge { invoke<T = unknown>(method: string, args?: unknown): Promise<T>; onDispose(callback: () => void): () => void }
export interface PluginManifest {
  manifestVersion: 1; id: string; title: string; description: string; api: string;
  ui: string; category?: string; releaseNotes?: string;
  permissions: { files?: boolean; credentials?: string[]; network?: string[] };
  services?: { provides?: string[]; requires?: string[] };
  backend?: { type: 'node' | 'executable'; entry: Record<string, string> };
  settings?: { title: string; entry: string };
}
export function createPluginClient(bridge?: PluginBridge): {
  invoke<T = unknown>(method: string, args?: unknown): Promise<T>;
  files: { pick(options?: { extensions?: string[] }): Promise<FileToken | null>; read(token: string): Promise<{ data: string; mime: string }>; create(options: { data: string; filename: string; mime: string }): Promise<FileToken>; url(token: string): Promise<string>; release(token: string): Promise<void>; save(token: string, filename: string): Promise<boolean> };
  credentials: { set(name: string, value: string): Promise<void>; status(name: string): Promise<boolean>; clear(name: string): Promise<void> };
  network: { request(options: { url: 'https://api.remove.bg/v1.0/removebg'; fileToken: string; credential: string; taskId?: string }): Promise<FileToken>; request(options: NetworkRequest & { responseType: 'file' }): Promise<{ status: number; mime: string; file: FileToken }>; request(options: NetworkRequest & { responseType?: 'data' }): Promise<{ status: number; mime: string; data: string }> };
  services: { call<T = unknown>(service: string, method: string, args?: unknown): Promise<T> };
  tasks: { cancel(id: string): Promise<void> };
  registerTool(value: { title: string }): Promise<void>; registerSettings(value: { title: string }): Promise<void>;
  onDispose(callback: () => void): () => void;
};
export interface NetworkRequest {
  url: string; method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'; json?: unknown;
  multipart?: { fields?: Record<string, string>; files?: { field: string; token: string }[] };
  credential?: string; credentialHeader?: 'Authorization' | 'X-Api-Key'; taskId?: string;
  responseType?: 'data' | 'file'; filename?: string;
}
