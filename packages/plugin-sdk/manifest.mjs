import { lstat, realpath } from 'node:fs/promises';
import path from 'node:path';
import semver from 'semver';
export const API_VERSION = '1.1.0';
export const TARGET = process.platform + '-' + process.arch;
export function safeRelative(value) {
  if (typeof value !== 'string' || !value || value.includes('\\') || value.includes(':') || value.includes('\0') || path.posix.isAbsolute(value)) throw new Error('插件路径无效。');
  const parts = value.split('/');
  if (parts.some(p => !p || p === '.' || p === '..' || /[. ]$/.test(p) || /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(p))) throw new Error('插件路径无效。');
  return value;
}
export function validateManifest(pkg, target = TARGET) {
  const m = pkg?.commerce;
  if (!m || m.manifestVersion !== 1 || !/^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)+$/.test(m.id) || m.id.startsWith('system.') || m.id.length > 96) throw new Error('插件标识或清单格式无效。');
  if (!semver.valid(pkg.version) || !semver.satisfies(API_VERSION, m.api || '')) throw new Error('插件 API 版本不兼容。');
  if (typeof m.title !== 'string' || !m.title.trim() || m.title.length > 80 || typeof m.description !== 'string' || m.description.length > 2000) throw new Error('插件名称与说明无效。');
  safeRelative(m.ui);
  if (m.settings) { if (typeof m.settings.title !== 'string') throw new Error('插件设置无效。'); safeRelative(m.settings.entry); }
  const permissions = m.permissions ?? {};
  if (Object.keys(permissions).some(k => !['files', 'network', 'credentials'].includes(k))) throw new Error('插件申请了不支持的权限。');
  if (permissions.files !== undefined && typeof permissions.files !== 'boolean') throw new Error('文件权限无效。');
  for (const key of ['network', 'credentials']) if (permissions[key] !== undefined && (!Array.isArray(permissions[key]) || permissions[key].length > 16 || permissions[key].some(v => typeof v !== 'string'))) throw new Error('插件权限无效。');
  for (const origin of permissions.network ?? []) { const url = new URL(origin); if (url.protocol !== 'https:' || url.origin !== origin || url.username || url.password) throw new Error('网络权限必须为 HTTPS 来源。'); }
  for (const name of permissions.credentials ?? []) if (!/^[a-z][a-z0-9.-]{0,63}$/.test(name)) throw new Error('凭据名称无效。');
  for (const kind of ['provides', 'requires']) if (m.services?.[kind] && (!Array.isArray(m.services[kind]) || m.services[kind].some(s => !/^[a-z][a-z0-9.-]{1,95}$/.test(s)))) throw new Error('服务声明无效。');
  if (m.backend) { if (!['node', 'executable'].includes(m.backend.type) || !m.backend.entry?.[target]) throw new Error('插件不支持当前平台。'); for (const entry of Object.values(m.backend.entry)) safeRelative(entry); }
  return { ...m, permissions, version: pkg.version };
}
export async function confinedPath(root, relative) {
  safeRelative(relative);
  const canonical = await realpath(root);
  let cursor = canonical;
  for (const part of relative.split('/')) {
    cursor = path.join(cursor, part);
    if ((await lstat(cursor)).isSymbolicLink()) throw new Error('插件资源不允许符号链接。');
  }
  const resolved = await realpath(cursor);
  if (!resolved.startsWith(canonical + path.sep)) throw new Error('资源越过插件目录。');
  return resolved;
}
export function allowedNetwork(manifest, address) {
  const url = new URL(address);
  if (url.protocol !== 'https:' || url.username || url.password || !(manifest.permissions.network ?? []).includes(url.origin)) throw new Error('插件没有访问此服务的权限。');
  return url;
}
