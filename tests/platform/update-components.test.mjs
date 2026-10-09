import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, createHash, sign } from 'node:crypto';
import { createServer } from 'node:http';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile, symlink, chmod, stat } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import os from 'node:os';
import path from 'node:path';
import AdmZip from 'adm-zip';
import { buildComponentArtifacts } from '../../scripts/component-artifacts.mjs';
import { prepareComponentUpdate, readComponentManifest, signComponentManifest, validateComponentManifest, verifyBundleInventory, componentManifestName } from '../../desktop/update-components.mjs';
import { cachedFile } from '../../desktop/update-download.mjs';
import { verifyMacBundle } from '../../desktop/mac-update.mjs';

const execute = promisify(execFile), mac = { skip: process.platform !== 'darwin' };
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const keys = generateKeyPairSync('ed25519'), publicKey = keys.publicKey.export({ type: 'spki', format: 'pem' });
async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'qingzuo-components-'));
  const target = path.join(root, 'target/Qingzuo.app'), installed = path.join(root, 'installed/Qingzuo.app'), output = path.join(root, 'assets'), cache = path.join(root, 'cache');
  const contents = {
    'Contents/Info.plist': '<plist><dict><key>CFBundleIdentifier</key><string>com.commerce.tools.desktop</string><key>CFBundleExecutable</key><string>Qingzuo</string><key>CFBundleShortVersionString</key><string>0.2.4</string><key>CFBundlePackageType</key><string>APPL</string></dict></plist>',
    'Contents/Resources/app.asar': 'updated UI',
    'Contents/Resources/app.asar.unpacked/node_modules/native/data': Buffer.alloc(40000, 9),
    'Contents/Resources/commerce/plugins/official.labeledit/backend/runtime': Buffer.alloc(40000, 6),
    'Contents/Resources/commerce/plugins/official.labeledit/backend/label-edit-backend/label-edit-backend': 'frozen backend code',
    'Contents/Resources/commerce/plugins/official.labeledit/backend/_internal/.models/model.onnx': Buffer.alloc(30000, 7),
    'Contents/Resources/commerce/plugins/official.labeledit/ui/index.html': 'plugin UI',
  };
  for (const [name, bytes] of Object.entries(contents)) { await mkdir(path.dirname(path.join(target, name)), { recursive: true }); await writeFile(path.join(target, name), bytes, { mode: 0o644 }); }
  await mkdir(path.join(target, 'Contents/MacOS')); await cp('/usr/bin/true', path.join(target, 'Contents/MacOS/Qingzuo')); await chmod(path.join(target, 'Contents/MacOS/Qingzuo'), 0o755);
  await symlink('runtime', path.join(target, 'Contents/Resources/commerce/plugins/official.labeledit/backend/runtime-link'));
  await execute('/usr/bin/codesign', ['--force', '--sign', '-', target]);
  await cp(target, installed, { recursive: true, verbatimSymlinks: true });
  await writeFile(path.join(installed, 'Contents/Resources/app.asar'), 'old UI');
  const manifest = await buildComponentArtifacts({ bundle: target, output, version: '0.2.4', privateKey: keys.privateKey });
  const name = componentManifestName('0.2.4'), bytes = await readFile(path.join(output, name));
  const manifestArtifact = { url: `https://github.com/ZhiPenTu/LabelEdit/releases/download/v0.2.4/${name}`, size: bytes.length, sha256: sha256(bytes) };
  const requests = [];
  const server = createServer(async (req, res) => {
    requests.push({ name: path.basename(req.url), range: req.headers.range });
    try {
      const data = await readFile(path.join(output, path.basename(req.url))), match = req.headers.range?.match(/^bytes=(\d+)-(\d+)$/);
      if (match) { const start = Number(match[1]), end = Number(match[2]); res.writeHead(206, { 'content-range': `bytes ${start}-${end}/${data.length}`, 'content-length': end - start + 1 }); res.end(data.subarray(start, end + 1)); }
      else { res.writeHead(200, { 'content-length': data.length }); res.end(data); }
    } catch { res.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await rm(root, { recursive: true, force: true }); });
  const options = { fetchImpl: (url, init) => fetch(`http://127.0.0.1:${server.address().port}${new URL(url).pathname}`, init) };
  return { manifest, manifestArtifact, root, target, installed, output, cache, requests, options, async prepare(extra = {}) {
    const staging = await mkdtemp(path.join(root, 'stage-'));
    return prepareComponentUpdate({ manifestArtifact, publicKey, version: '0.2.4', installed, staging, cache, options, ...extra });
  } };
}

test('a signed component update reuses unchanged installed runtimes and reconstructs a codesign-valid application', mac, async t => {
  const f = await fixture(t), states = [];
  const bundle = await f.prepare({ notify: state => states.push(state) });
  assert.deepEqual(f.requests.map(r => r.name), [componentManifestName('0.2.4'), 'CommerceTools-0.2.4-mac-arm64.core.zip']);
  await verifyBundleInventory(bundle, f.manifest.files); await verifyMacBundle(bundle, '0.2.4');
  const core = f.manifest.components.find(c => c.id === 'core');
  assert.equal(states.at(-1).total, core.artifact.size); assert.ok(states.at(-1).reusedBytes > 110000);
  assert.equal(await readFile(path.join(f.installed, 'Contents/Resources/app.asar'), 'utf8'), 'old UI');
  const second = path.join(f.root, 'again');
  await buildComponentArtifacts({ bundle: f.target, output: second, version: '0.2.4', privateKey: keys.privateKey });
  for (const c of f.manifest.components) assert.equal(sha256(await readFile(path.join(second, path.basename(c.artifact.url)))), c.artifact.sha256);
});

test('changed, missing and corrupted installed components are fetched, and validated component caches eliminate repeat requests', mac, async t => {
  const f = await fixture(t);
  await writeFile(path.join(f.installed, 'Contents/Resources/commerce/plugins/official.labeledit/backend/runtime'), 'corrupt');
  await rm(path.join(f.installed, 'Contents/Resources/commerce/plugins/official.labeledit/backend/_internal/.models/model.onnx'));
  await f.prepare();
  assert.deepEqual(f.requests.slice(1).map(r => r.name).sort(), ['core', 'ocr-models', 'ocr-runtime'].map(id => `CommerceTools-0.2.4-mac-arm64.${id}.zip`).sort());
  f.requests.length = 0; await f.prepare(); assert.equal(f.requests.length, 0);
  const core = f.manifest.components.find(c => c.id === 'core'); await writeFile(cachedFile(f.cache, core.artifact), 'corrupt');
  await f.prepare(); assert.equal(f.requests.length, 1); assert.ok(f.requests[0].name.endsWith('.core.zip'));
});

test('changing the frozen plugin entry downloads plugin code while reusing Python libraries and models', mac, async t => {
  const f = await fixture(t);
  await cp(path.join(f.target, 'Contents/Resources/app.asar'), path.join(f.installed, 'Contents/Resources/app.asar'));
  await writeFile(path.join(f.installed, 'Contents/Resources/commerce/plugins/official.labeledit/backend/label-edit-backend/label-edit-backend'), 'previous code');
  const bundle = await f.prepare(); await verifyMacBundle(bundle, '0.2.4');
  assert.deepEqual(f.requests.map(r => r.name), [componentManifestName('0.2.4'), 'CommerceTools-0.2.4-mac-arm64.plugin-code.zip']);
});

test('component download cancellation resumes the exact partial archive without changing the installed app', mac, async t => {
  const f = await fixture(t), controller = new AbortController();
  // A large uncompressible core payload makes the interruption occur mid-body.
  const bytes = Buffer.alloc(500000); for (let i = 0; i < bytes.length; i++) bytes[i] = Math.random() * 256;
  await writeFile(path.join(f.target, 'Contents/Resources/app.asar'), bytes);
  const manifest = await buildComponentArtifacts({ bundle: f.target, output: f.output, version: '0.2.4', privateKey: keys.privateKey });
  const envelope = await readFile(path.join(f.output, componentManifestName('0.2.4')));
  const manifestArtifact = { ...f.manifestArtifact, size: envelope.length, sha256: sha256(envelope) };
  await assert.rejects(f.prepare({ manifestArtifact, options: { ...f.options, signal: controller.signal }, notify: state => { if (state.transferred > 0) controller.abort(new Error('interrupted')); } }), /interrupted/);
  const core = manifest.components.find(c => c.id === 'core'), partial = (await stat(cachedFile(f.cache, core.artifact) + '.part')).size;
  assert.ok(partial > 0 && partial < core.artifact.size);
  f.requests.length = 0; await f.prepare({ manifestArtifact });
  assert.equal(f.requests[0].range, `bytes=${partial}-${core.artifact.size - 1}`);
  assert.equal(await readFile(path.join(f.installed, 'Contents/Resources/app.asar'), 'utf8'), 'old UI');
});

test('manifest signatures bind product, platform and version and reject plugin-domain signatures', mac, async t => {
  const f = await fixture(t), bytes = await readFile(path.join(f.output, componentManifestName('0.2.4')));
  assert.equal(readComponentManifest(bytes, publicKey, '0.2.4').version, '0.2.4');
  assert.throws(() => readComponentManifest(bytes, publicKey, '0.2.5'), /不匹配/);
  const wrong = generateKeyPairSync('ed25519').publicKey.export({ type: 'spki', format: 'pem' });
  assert.throws(() => readComponentManifest(bytes, wrong, '0.2.4'), /签名验证失败/);
  const envelope = JSON.parse(bytes), payload = Buffer.from(envelope.payload, 'base64');
  envelope.signature = sign(null, payload, keys.privateKey).toString('base64');
  assert.throws(() => readComponentManifest(Buffer.from(JSON.stringify(envelope)), publicKey, '0.2.4'), /签名验证失败/);
  const changed = structuredClone(f.manifest); changed.platform = 'win32-x64';
  assert.throws(() => validateComponentManifest(changed, '0.2.4'), /不匹配/);
});

test('manifest paths, links, file budgets and duplicate paths cannot escape staging', mac, async t => {
  const f = await fixture(t);
  for (const invalid of ['../outside', '/absolute', 'Contents/../outside', 'Contents\\outside', 'Contents//outside']) {
    const value = structuredClone(f.manifest); value.files[1].path = invalid; assert.throws(() => validateComponentManifest(value, '0.2.4'));
  }
  const duplicate = structuredClone(f.manifest); duplicate.files.push({ ...duplicate.files[1], path: duplicate.files[1].path.toUpperCase() }); assert.throws(() => validateComponentManifest(duplicate, '0.2.4'));
  const linked = structuredClone(f.manifest); linked.files.find(f => f.type === 'symlink').target = '../../../../../../outside'; assert.throws(() => validateComponentManifest(linked, '0.2.4'));
  const nested = structuredClone(f.manifest); nested.files.find(f => f.path.endsWith('/backend/_internal')).type = 'symlink'; assert.throws(() => validateComponentManifest(nested, '0.2.4'));
  const chain = structuredClone(f.manifest);
  const backend = 'Contents/Resources/commerce/plugins/official.labeledit/backend/';
  chain.files.push({ path: backend + 'models-link', mode: 0o777, type: 'symlink', component: 'ocr-runtime', target: '_internal/.models' });
  chain.files.push({ path: backend + 'model-link', mode: 0o777, type: 'symlink', component: 'ocr-runtime', target: 'models-link/model.onnx' });
  assert.equal(validateComponentManifest(chain, '0.2.4'), chain);
  chain.files.at(-2).target = 'model-link'; assert.throws(() => validateComponentManifest(chain, '0.2.4'), /循环/);
});

test('a signed archive with an unexpected path never reaches installation', mac, async t => {
  const f = await fixture(t), value = structuredClone(f.manifest), core = value.components.find(c => c.id === 'core');
  const zip = new AdmZip(); zip.addFile('../outside', Buffer.from('evil')); const bytes = zip.toBuffer();
  await writeFile(path.join(f.output, path.basename(core.artifact.url)), bytes); core.artifact.size = bytes.length; core.artifact.sha256 = sha256(bytes);
  const envelope = signComponentManifest(value, keys.privateKey); await writeFile(path.join(f.output, componentManifestName('0.2.4')), envelope);
  await assert.rejects(f.prepare({ manifestArtifact: { ...f.manifestArtifact, size: envelope.length, sha256: sha256(envelope) } }), /非法文件/);
  assert.equal(await readFile(path.join(f.installed, 'Contents/Resources/app.asar'), 'utf8'), 'old UI');
  await assert.rejects(stat(path.join(f.root, 'outside')));
});

test('a signed archive cannot bypass individual payload hashes or reuse files through installed parent links', mac, async t => {
  const f = await fixture(t), value = structuredClone(f.manifest), core = value.components.find(c => c.id === 'core');
  const zip = new AdmZip(path.join(f.output, path.basename(core.artifact.url))), file = value.files.find(f => f.path === 'Contents/Resources/app.asar');
  zip.updateFile(file.sha256, Buffer.from('corrupt UI'));
  const bytes = zip.toBuffer(); await writeFile(path.join(f.output, path.basename(core.artifact.url)), bytes); core.artifact.size = bytes.length; core.artifact.sha256 = sha256(bytes);
  const envelope = signComponentManifest(value, keys.privateKey); await writeFile(path.join(f.output, componentManifestName('0.2.4')), envelope);
  await assert.rejects(f.prepare({ manifestArtifact: { ...f.manifestArtifact, size: envelope.length, sha256: sha256(envelope) } }), /完整性校验失败/);
  // Restore authentic assets, then attempt to redirect an unchanged model parent.
  await buildComponentArtifacts({ bundle: f.target, output: f.output, version: '0.2.4', privateKey: keys.privateKey });
  const parent = 'Contents/Resources/commerce/plugins/official.labeledit/backend/_internal/.models';
  const outside = path.join(f.root, 'outside'); await cp(path.join(f.installed, parent), outside, { recursive: true }); await rm(path.join(f.installed, parent), { recursive: true }); await symlink(outside, path.join(f.installed, parent));
  f.requests.length = 0; await f.prepare();
  assert.ok(f.requests.some(r => r.name.endsWith('.ocr-models.zip')));
});
