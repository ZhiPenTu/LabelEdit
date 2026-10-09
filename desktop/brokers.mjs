import { mkdir, readFile, writeFile, copyFile, realpath, lstat, rm } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { allowedNetwork } from './security.mjs';
export class FileBroker {
  constructor(root, dialog) { this.root = root; this.dialog = dialog; this.tokens = new Map(); }
  async create(plugin, bytes, name, mime = 'application/octet-stream') {
    if (bytes.length > 64 * 1024 * 1024) throw new Error('文件内容过大。');
    const dir = path.join(this.root, plugin.id); await mkdir(dir, { recursive: true, mode: 0o700 });
    const token = randomUUID(), filename = path.join(await realpath(dir), token); await writeFile(filename, bytes, { mode: 0o600 });
    const item = { token, name: path.basename(name), size: bytes.length, mime };
    this.tokens.set(token, { ...item, filename, owner: plugin.id }); return item;
  }
  async get(plugin, token) {
    const item = this.tokens.get(token);
    if (!item || item.owner !== plugin.id || !plugin.permissions.files) throw new Error('文件未授权或已失效。');
    if ((await lstat(item.filename)).isSymbolicLink() || await realpath(item.filename) !== item.filename) throw new Error('文件路径已改变。');
    return item;
  }
  async pick(plugin, options = {}) {
    if (!plugin.permissions.files) throw new Error('插件没有文件权限。');
    const extensions = (options.extensions ?? []).filter(s => typeof s === 'string' && /^[a-z0-9]{1,8}$/.test(s)).slice(0, 12);
    const result = await this.dialog.showOpenDialog({ title: plugin.title + ' · 选择文件', properties: ['openFile'], filters: extensions.length ? [{ name: '支持的文件', extensions }] : [] });
    if (result.canceled) return null;
    const filename = result.filePaths[0]; const info = await lstat(filename);
    if (!info.isFile() || info.size > 25 * 1024 * 1024) throw new Error('请选择不超过 25 MB 的文件。');
    const ext = path.extname(filename).toLowerCase();
    return this.create(plugin, await readFile(filename), path.basename(filename), ({ '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.pdf': 'application/pdf' })[ext]);
  }
  async read(plugin, token) { const item = await this.get(plugin, token); return { data: (await readFile(item.filename)).toString('base64'), mime: item.mime }; }
  async save(plugin, token, filename) {
    const item = await this.get(plugin, token);
    const result = await this.dialog.showSaveDialog({ title: plugin.title + ' · 保存文件', defaultPath: path.basename(filename || item.name) });
    if (result.canceled) return false; await copyFile(item.filename, result.filePath); return true;
  }
  async revoke(id) { const pending = []; for (const [key, value] of this.tokens) if (value.owner === id) { this.tokens.delete(key); pending.push(rm(value.filename, { force: true })); } await Promise.all(pending); }
}
export class NetworkBroker {
  constructor(files, credentials, request = (...args) => fetch(...args)) { this.files = files; this.credentials = credentials; this.request = request; this.tasks = new Map(); }
  async call(plugin, options) {
    const url = allowedNetwork(plugin, options.url);
    // v1's online capability is deliberately bounded to the documented upload API.
    if (url.href !== 'https://api.remove.bg/v1.0/removebg' || !(plugin.permissions.credentials ?? []).includes(options.credential)) throw new Error('服务或凭据未授权。');
    const item = await this.files.get(plugin, options.fileToken);
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(item.mime) || item.size > 22 * 1024 * 1024) throw new Error('请选择小于 22 MB 的 JPG、PNG 或 WebP 图片。');
    const secret = await this.credentials.get(plugin.id, options.credential); if (!secret) throw new Error('请先配置 remove.bg API 密钥。');
    const key = plugin.id + ':' + (options.taskId || randomUUID()); if (this.tasks.has(key)) throw new Error('任务已在运行。');
    const controller = new AbortController(); this.tasks.set(key, controller); const timer = setTimeout(() => controller.abort(), 120000);
    try {
      const form = new FormData(); form.append('image_file', new Blob([await readFile(item.filename)], { type: item.mime }), item.name); form.append('size', 'auto'); form.append('format', 'png');
      controller.signal.throwIfAborted();
      const response = await this.request(url.href, { method: 'POST', body: form, headers: { 'X-Api-Key': secret }, redirect: 'error', signal: controller.signal });
      if (!response.ok) {
        const message = response.status === 401 || response.status === 403 ? 'API 密钥无效或未授权。' : response.status === 402 ? 'remove.bg 调用额度不足。' : response.status === 429 ? '服务请求过于频繁，请稍后手动重试。' : '抠图服务未完成处理（' + response.status + '）。';
        throw new Error(message);
      }
      const chunks = []; let size = 0;
      for await (const chunk of response.body) { size += chunk.length; if (size > 64 * 1024 * 1024) { controller.abort(); throw new Error('服务返回的图片过大。'); } chunks.push(chunk); }
      const bytes = Buffer.concat(chunks);
      if (!bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) throw new Error('服务没有返回有效的 PNG 图片。');
      controller.signal.throwIfAborted();
      return await this.files.create(plugin, bytes, path.parse(item.name).name + '-透明背景.png', 'image/png');
    } catch (e) { if (controller.signal.aborted) throw new Error('抠图任务已取消或超时；请检查额度后再重试。'); throw e; }
    finally { clearTimeout(timer); this.tasks.delete(key); }
  }
  cancel(id, task) { this.tasks.get(id + ':' + task)?.abort(); }
  stop(id) { for (const [key, controller] of this.tasks) if (key.startsWith(id + ':')) controller.abort(); }
}
