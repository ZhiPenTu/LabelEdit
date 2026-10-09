import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { generateKeyPairSync, sign, createHash } from 'node:crypto';
import AdmZip from 'adm-zip';
import { PluginManager, unpackPackage, verifyArtifact } from '../../desktop/plugin-manager.mjs';
import { validateManifest, TARGET } from '../../desktop/security.mjs';
function archive(version = '0.1.0', overrides = {}) {
  const zip = new AdmZip(); zip.addFile('package.json', Buffer.from(JSON.stringify({ name: 'fixture', version, commerce: { manifestVersion: 1, id: 'local.fixture', title: 'Fixture', description: 'test', api: '^1.0.0', ui: 'ui/index.html', permissions: {}, ...overrides } }))); zip.addFile('ui/index.html', Buffer.from('<h1>Fixture</h1>')); return zip.toBuffer();
}
test('local plugin can install, persist, disable, enable, upgrade, rollback and uninstall without a base build', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'commerce-manager-')); const bundled = path.join(root, 'bundled'); await mkdir(bundled);
  const stops = []; const manager = new PluginManager(path.join(root, 'plugins'), bundled, { stop: async id => stops.push(id) });
  try {
    await manager.initialize(); await manager.install(archive()); assert.equal((await manager.list())[0].version, '0.1.0');
    await manager.setEnabled('local.fixture', false); assert.equal((await manager.get('local.fixture')).enabled, false);
    await manager.setEnabled('local.fixture', true); await manager.install(archive('0.2.0')); assert.equal((await manager.get('local.fixture')).version, '0.2.0');
    await manager.rollback('local.fixture'); assert.equal((await manager.get('local.fixture')).version, '0.1.0');
    const reloaded = new PluginManager(path.join(root, 'plugins'), bundled); await reloaded.initialize(); assert.equal((await reloaded.get('local.fixture')).version, '0.1.0');
    await manager.uninstall('local.fixture'); assert.equal((await manager.list()).length, 0); assert.ok(stops.length >= 5);
  } finally { await rm(root, { recursive: true, force: true }); }
});
test('failed upgrade preserves prior active version and persistent state', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'commerce-upgrade-')); await mkdir(path.join(root, 'bundled'));
  const manager = new PluginManager(path.join(root, 'plugins'), path.join(root, 'bundled'), { probe: async p => { if (p.version === '0.2.0') throw new Error('startup failed'); } });
  try { await manager.initialize(); await manager.install(archive()); const state = await readFile(path.join(root, 'plugins/state.json')); await assert.rejects(manager.install(archive('0.2.0')), /startup failed/); assert.equal((await manager.get('local.fixture')).version, '0.1.0'); assert.deepEqual(await readFile(path.join(root, 'plugins/state.json')), state); }
  finally { await rm(root, { recursive: true, force: true }); }
});
test('package signature binds artifact bytes, target, plugin identity and version', () => {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519'); const bytes = archive(); const record = { platform: TARGET, sha256: createHash('sha256').update(bytes).digest('hex'), signature: sign(null, bytes, privateKey).toString('base64') };
  verifyArtifact(bytes, record, publicKey); assert.throws(() => verifyArtifact(Buffer.concat([bytes, Buffer.from('tampered')]), record, publicKey)); assert.throws(() => verifyArtifact(bytes, { ...record, platform: 'invalid' }, publicKey)); assert.throws(() => verifyArtifact(bytes, record, null));
});
test('path traversal and symlink package entries are rejected before extraction', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'commerce-malicious-'));
  try {
    // Rewrite actual local/central ZIP names; AdmZip.addFile normalizes traversal.
    const bytes = archive(); const from=Buffer.from('ui/index.html'), to=Buffer.from('../index.html');
    for(let offset=bytes.indexOf(from);offset>=0;offset=bytes.indexOf(from,offset+from.length)) to.copy(bytes,offset);
    await assert.rejects(unpackPackage(bytes,path.join(root,'stage')),/插件路径无效/);
    const zip=new AdmZip(archive());zip.addFile('symlink',Buffer.from('/tmp'));zip.getEntry('symlink').header.attr=(0o120777<<16)>>>0;
    await assert.rejects(unpackPackage(zip.toBuffer(),path.join(root,'stage')),/文件类型/);
  } finally {await rm(root,{recursive:true,force:true});}
});
test('incompatible APIs, reserved identifiers and unsupported platforms are rejected', () => {
  for (const commerce of [{ api: '^2' }, { id: 'system.market' }, { ui: '../index.html' }, { permissions: { network: ['http://localhost'] } }, { backend: { type: 'executable', entry: {} } }]) {
    const zip = new AdmZip(archive('0.1.0', commerce)); assert.throws(() => validateManifest(JSON.parse(zip.readAsText('package.json'))));
  }
});
test('missing service dependencies prevent activation and preserve installed tools', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'commerce-dependency-')); await mkdir(path.join(root, 'bundled')); const manager = new PluginManager(path.join(root, 'plugins'), path.join(root, 'bundled'));
  try { await manager.initialize(); await assert.rejects(manager.install(archive('0.1.0', { services: { requires: ['unavailable.service'] } })), /缺少服务/); assert.equal((await manager.list()).length, 0); }
  finally { await rm(root, { recursive: true, force: true }); }
});

test('corrupt installed state does not prevent bundled tools from starting',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'commerce-state-'));await mkdir(path.join(root,'bundled'));await mkdir(path.join(root,'plugins'));await writeFile(path.join(root,'plugins/state.json'),' {"plugins":{"bad":null}}');
 try {const manager=new PluginManager(path.join(root,'plugins'),path.join(root,'bundled'));await manager.initialize();assert.deepEqual(await manager.list(),[]);await manager.install(archive());assert.equal((await manager.list()).length,1);}finally{await rm(root,{recursive:true,force:true});}
});
