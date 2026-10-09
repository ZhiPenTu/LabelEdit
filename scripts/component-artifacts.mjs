import { copyFile, chmod, mkdir, mkdtemp, readFile, rm, stat, utimes, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import AdmZip from 'adm-zip';
import { inventoryBundle, componentManifestName, signComponentManifest } from '../desktop/update-components.mjs';
import { fileDigest } from '../desktop/update-download.mjs';

const execute = promisify(execFile);
export async function buildComponentArtifacts({ bundle, output, version, privateKey }) {
  if (process.platform !== 'darwin') throw new Error('组件制品目前仅支持 macOS。');
  await mkdir(output, { recursive: true });
  const files = await inventoryBundle(bundle), components = [];
  for (const id of [...new Set(files.filter(f => f.component).map(f => f.component))].sort()) {
    const payloads = new Map(files.filter(f => f.component === id && f.type === 'file').map(f => [f.sha256, f]));
    const workspace = await mkdtemp(path.join(os.tmpdir(), 'qingzuo-component-pack-'));
    const name = `CommerceTools-${version}-mac-arm64.${id}.zip`, archive = path.join(workspace, name);
    try {
      for (const [hash, file] of payloads) {
        const target = path.join(workspace, hash);
        await copyFile(path.join(bundle, file.path), target, constants.COPYFILE_FICLONE);
        await chmod(target, 0o644); await utimes(target, new Date('2000-01-01T00:00:00Z'), new Date('2000-01-01T00:00:00Z'));
      }
      if (payloads.size) await new Promise((resolve, reject) => {
        // Hashed names are fixed ASCII and are passed on stdin, never to a shell.
        const child = spawn('/usr/bin/zip', ['-q', '-X', archive, '-@'], { cwd: workspace, stdio: ['pipe', 'ignore', 'pipe'], env: { ...process.env, TZ: 'UTC' } });
        let error = ''; child.stderr.on('data', chunk => { error += chunk.toString(); });
        child.once('error', reject); child.once('exit', code => code === 0 ? resolve() : reject(new Error('组件打包失败：' + error)));
        child.stdin.end([...payloads.keys()].sort().join('\n') + '\n');
      });
      else await writeFile(archive, new AdmZip().toBuffer());
      const artifact = { url: `https://github.com/ZhiPenTu/LabelEdit/releases/download/v${version}/${name}`, size: (await stat(archive)).size, sha256: await fileDigest(archive) };
      await copyFile(archive, path.join(output, name)); components.push({ id, artifact });
    } finally { await rm(workspace, { recursive: true, force: true }); }
  }
  const manifest = { schemaVersion: 1, product: 'com.commerce.tools.desktop', platform: 'darwin-arm64', version, bundle: 'Qingzuo.app', components, files };
  const bytes = signComponentManifest(manifest, privateKey);
  if (bytes.length > 16 * 1024 ** 2) throw new Error('组件签名清单过大。');
  await writeFile(path.join(output, componentManifestName(version)), bytes);
  return manifest;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href && process.platform === 'darwin') {
  const bundle = path.resolve('release/desktop/mac-arm64/Qingzuo.app');
  const { version } = JSON.parse(await readFile('package.json', 'utf8'));
  const key = process.env.COMMERCE_PLUGIN_SIGNING_KEY;
  if (!key) throw new Error('组件更新制品缺少签名密钥。');
  await execute('/usr/bin/codesign', ['--verify', '--deep', '--strict', bundle], { timeout: 300000 });
  const result = await execute('/usr/libexec/PlistBuddy', ['-c', 'Print :CFBundleShortVersionString', path.join(bundle, 'Contents/Info.plist')]);
  if (result.stdout.trim() !== version) throw new Error('组件更新制品版本与完整应用不匹配。');
  const manifest = await buildComponentArtifacts({ bundle, output: path.resolve('release/components'), version, privateKey: key });
  console.log('Signed macOS update components:', manifest.components.map(c => `${c.id} ${(c.artifact.size / 1024 ** 2).toFixed(1)} MB`).join(', '));
}
