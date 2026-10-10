import { createHash, generateKeyPairSync } from 'node:crypto';
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { access, cp, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { buildComponentArtifacts } from './component-artifacts.mjs';
import { componentManifestName, prepareComponentUpdate } from '../desktop/update-components.mjs';
import { verifyMacBundle } from '../desktop/mac-update.mjs';

if (process.platform !== 'darwin') process.exit(0);
const temporary = await mkdtemp(path.join(os.tmpdir(), 'qingzuo-real-component-update-'));
const target = path.resolve('release/desktop/mac-arm64/Qingzuo.app'), { version } = JSON.parse(await readFile('package.json', 'utf8'));
let server;
try {
  let output, publicKey;
  if (process.argv.includes('--release-artifacts')) {
    output = path.resolve('release/components');
    const config = JSON.parse(await readFile('resources/generated/market.json', 'utf8'));
    publicKey = config.updatePublicKey || config.publicKey;
  } else {
    const keys = generateKeyPairSync('ed25519'); publicKey = keys.publicKey.export({ type: 'spki', format: 'pem' });
    output = path.join(temporary, 'artifacts');
    await buildComponentArtifacts({ bundle: target, output, version, privateKey: keys.privateKey });
  }
  const installed = path.join(temporary, 'installed/Qingzuo.app');
  await cp(target, installed, { recursive: true, verbatimSymlinks: true });
  await writeFile(path.join(installed, 'Contents/Resources/app.asar'), 'previous application code');
  const legacyDirectory = 'Contents/Resources/commerce/plugins/official.labeledit/backend';
  await mkdir(path.join(installed, legacyDirectory), { recursive: true });
  await writeFile(path.join(installed, legacyDirectory, 'old-runtime'), 'obsolete bundled plugin');
  const manifestName = componentManifestName(version), bytes = await readFile(path.join(output, manifestName));
  const manifestArtifact = { url: `https://github.com/ZhiPenTu/LabelEdit/releases/download/v${version}/${manifestName}`, size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
  const requests = [], states = [];
  server = createServer(async (req, res) => {
    const filename = path.join(output, path.basename(req.url)); requests.push(path.basename(req.url));
    try {
      const { size } = await stat(filename), range = req.headers.range?.match(/^bytes=(\d+)-(\d+)$/);
      if (range) {
        const start = Number(range[1]), end = Number(range[2]);
        if (start > end || end >= size) { res.writeHead(416).end(); return; }
        res.writeHead(206, { 'content-range': `bytes ${start}-${end}/${size}`, 'content-length': end - start + 1 }); createReadStream(filename, { start, end }).pipe(res);
      } else { res.writeHead(200, { 'content-length': size }); createReadStream(filename).pipe(res); }
    } catch { res.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const staging = path.join(temporary, 'staging'); await mkdir(staging);
  const prepared = await prepareComponentUpdate({ manifestArtifact, publicKey, version, installed, staging, cache: path.join(temporary, 'cache'), notify: value => states.push(value),
    options: { fetchImpl: (url, init) => fetch(`http://127.0.0.1:${server.address().port}${new URL(url).pathname}`, init) } });
  await verifyMacBundle(prepared, version);
  const envelope = JSON.parse(bytes), manifest = JSON.parse(Buffer.from(envelope.payload, 'base64'));
  assert.deepEqual(manifest.components.map(component => component.id).sort(), ['core', 'dependencies', 'electron']);
  assert.equal(manifest.files.some(file => file.path.includes('/commerce/plugins/')), false);
  await assert.rejects(access(path.join(prepared, legacyDirectory)));
  assert.deepEqual(requests, [manifestName, `CommerceTools-${version}-mac-arm64.core.zip`]);
  console.log('Complete application reconstructed and codesign verified; downloading only the changed core component.');
  const executable = path.join(prepared, 'Contents/MacOS/Qingzuo');
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['scripts/test-packaged-desktop.mjs', executable], { stdio: 'inherit' });
    child.once('error', reject); child.once('exit', code => code === 0 ? resolve() : reject(new Error('重建应用的离线回归失败。')));
  });
  const metrics = { version, source: 'local HTTP component artifacts', manifestBytes: bytes.length, downloadedArchiveBytes: states.at(-1).transferred,
    totalHTTPPayloadBytes: bytes.length + states.at(-1).transferred, reusedInstalledBytes: states.at(-1).reusedBytes, requests, codesign: 'passed', harness: 'passed', purePlatform: 'passed' };
  await mkdir('output/update-validation', { recursive: true });
  await writeFile('output/update-validation/components.json', JSON.stringify(metrics, null, 2));
  console.log(JSON.stringify(metrics));
} finally {
  if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
  await rm(temporary, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
}
