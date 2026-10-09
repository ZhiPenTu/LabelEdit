import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import path from 'node:path';
import { checkGitHubRelease } from './updates.mjs';

const execute = promisify(execFile);
const bundleID = 'com.commerce.tools.desktop';

export async function downloadRelease(artifact, destination, notify, { fetchImpl = globalThis.fetch, signal } = {}) {
  if (!/^https:\/\/github\.com\/ZhiPenTu\/LabelEdit\/releases\/download\/v\d+\.\d+\.\d+\/CommerceTools-\d+\.\d+\.\d+-mac-arm64\.zip$/.test(artifact.url)
      || !/^[a-f0-9]{64}$/.test(artifact.sha256) || !Number.isSafeInteger(artifact.size) || artifact.size <= 0 || artifact.size > 2 * 1024 ** 3) throw new Error('更新下载信息无效。');
  const controller = new AbortController();
  const downloadSignal = signal ? AbortSignal.any([controller.signal, signal]) : controller.signal;
  let response;
  let idle;
  const touch = () => { clearTimeout(idle); idle = setTimeout(() => controller.abort(new Error('下载超时，请重试。')), 60_000); };
  const deadline = setTimeout(() => controller.abort(new Error('下载超时，请重试。')), 30 * 60_000);
  const digest = createHash('sha256');
  let transferred = 0, lastNotification = 0;
  try {
    touch();
    response = await fetchImpl(artifact.url, { signal: downloadSignal });
    if (!response.ok || !response.body) throw new Error(`更新下载失败（HTTP ${response.status}），请重试。`);
    const total = Number(response.headers.get('content-length'));
    if (total && total !== artifact.size) throw new Error('安装包大小与发布信息不一致。');
    const meter = new Transform({ transform(chunk, _encoding, callback) {
      touch(); transferred += chunk.length;
      if (transferred > artifact.size) { callback(new Error('安装包超过预期大小。')); return; }
      digest.update(chunk);
      if (Date.now() - lastNotification >= 150 || transferred === artifact.size) {
        lastNotification = Date.now();
        notify({ status: 'downloading', progress: transferred / artifact.size * 100, transferred, total: artifact.size });
      }
      callback(null, chunk);
    } });
    await pipeline(Readable.fromWeb(response.body), meter, createWriteStream(destination, { flags: 'wx', mode: 0o600 }), { signal: downloadSignal });
    if (transferred !== artifact.size || digest.digest('hex') !== artifact.sha256) throw new Error('安装包完整性校验失败，请重新下载。');
  } catch (error) {
    await rm(destination, { force: true });
    throw downloadSignal.aborted ? downloadSignal.reason : error;
  } finally { clearTimeout(idle); clearTimeout(deadline); await response?.body?.cancel().catch(() => {}); }
}

export function applicationBundle(executable) {
  const app = path.resolve(executable, '../../..');
  if (!app.endsWith('.app') || path.dirname(executable) !== path.join(app, 'Contents', 'MacOS')) throw new Error('请从已安装的轻作应用中更新。');
  if (app.startsWith('/Volumes/') || app.includes('/AppTranslocation/')) throw new Error('请先将轻作移到“应用程序”文件夹，再重新打开并更新。');
  return app;
}

async function plist(bundle, key) {
  return (await execute('/usr/libexec/PlistBuddy', ['-c', `Print :${key}`, path.join(bundle, 'Contents/Info.plist')])).stdout.trim();
}

export async function prepareMacUpdate(archive, staging, version, signal) {
  const extracted = path.join(staging, 'extracted');
  await mkdir(extracted);
  await execute('/usr/bin/ditto', ['-x', '-k', archive, extracted], { timeout: 5 * 60_000, signal });
  const entries = await readdir(extracted, { withFileTypes: true });
  const bundles = entries.filter(entry => entry.isDirectory() && entry.name.endsWith('.app'));
  if (bundles.length !== 1) throw new Error('更新包必须包含一个应用。');
  const bundle = path.join(extracted, bundles[0].name);
  if (await plist(bundle, 'CFBundleIdentifier') !== bundleID || await plist(bundle, 'CFBundleShortVersionString') !== version) throw new Error('更新包的应用标识或版本不匹配。');
  const executable = await plist(bundle, 'CFBundleExecutable');
  if (path.basename(executable) !== executable || !(await stat(path.join(bundle, 'Contents/MacOS', executable))).isFile()) throw new Error('更新包缺少有效的启动程序。');
  await execute('/usr/bin/codesign', ['--verify', '--deep', '--strict', bundle], { timeout: 5 * 60_000, signal });
  return bundle;
}

export async function launchMacInstaller({ target, prepared, staging, receipt, profile, parent = process.pid }) {
  // Copy outside the .app; the helper must survive replacement of app.asar.
  const script = path.join(staging, 'install.sh');
  await writeFile(script, await readFile(new URL('./mac-install.sh', import.meta.url)), { mode: 0o700 });
  const child = spawn('/bin/sh', [script, String(parent), target, prepared, staging, receipt, profile], { detached: true, stdio: ['ignore', 'pipe', 'ignore'] });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { child.kill(); reject(new Error('更新安装助手启动超时。')); }, 5000);
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('exit', code => { clearTimeout(timer); reject(new Error(`更新安装助手已退出（${code}）。`)); });
    child.stdout.once('data', () => { clearTimeout(timer); child.stdout.destroy(); resolve(); });
  });
  child.unref();
  return child;
}

export function macUpdateAdapter({ app, beforeInstall, receipt }) {
  let active;
  return {
    check: () => checkGitHubRelease(app.getVersion()),
    cancel: () => active?.abort(new Error('更新已取消。')),
    async download(release, notify) {
      const controller = new AbortController(); active = controller;
      const target = applicationBundle(app.getPath('exe'));
      let staging;
      try { staging = await mkdtemp(path.join(path.dirname(target), '.qingzuo-update-')); }
      catch { throw new Error('应用所在文件夹不可写，请将轻作移到有写入权限的“应用程序”文件夹后重试。'); }
      try {
        const archive = path.join(staging, 'update.zip');
        await downloadRelease(release.artifact, archive, notify, { signal: controller.signal });
        notify({ status: 'extracting', progress: 100 });
        const prepared = await prepareMacUpdate(archive, staging, release.version, controller.signal);
        await rm(archive);
        controller.signal.throwIfAborted();
        return { target, prepared, staging, receipt, profile: app.getPath('userData') };
      } catch (error) { await rm(staging, { recursive: true, force: true }); throw error; }
      finally { active = null; }
    },
    async install(prepared) {
      let helper;
      try {
        helper = await launchMacInstaller(prepared);
        await beforeInstall();
        app.quit();
      } catch (error) {
        helper?.kill();
        await rm(prepared.staging, { recursive: true, force: true });
        throw error;
      }
    },
  };
}

export async function previousUpdateError(receipt) {
  try { const error = await readFile(receipt, 'utf8'); await rm(receipt); return error.trim(); }
  catch (error) { if (error.code !== 'ENOENT') throw error; return null; }
}
