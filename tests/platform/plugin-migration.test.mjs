import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { preparePluginMigration } from '../../desktop/plugin-migration.mjs';
import { PluginManager } from '../../desktop/plugin-manager.mjs';
import AdmZip from 'adm-zip';

test('fresh profiles remain empty and legacy restore preserves disabled/uninstalled/independent states', async () => {
  for (const [legacy, record, expected] of [[false, null, false], [true, null, true], [true, { enabled: false }, true], [true, { removed: true }, false], [true, { folder: 'installed/existing' }, false]]) {
    const root = await mkdtemp(path.join(os.tmpdir(), 'qingzuo-migration-'));
    try {
      if (legacy) { await mkdir(path.join(root, 'harness/profiles/commerce-desktop'), { recursive: true }); await writeFile(path.join(root, 'harness/profiles/commerce-desktop/package.json'), '{}'); }
      await mkdir(path.join(root, 'plugins'));
      await writeFile(path.join(root, 'plugins/state.json'), JSON.stringify({ plugins: record ? { 'official.labeledit': record } : {} }));
      const migration = await preparePluginMigration(root), manager = { list: async () => [] };
      assert.equal(Boolean(await migration.status(manager)), expected);
      if (record?.enabled === false) assert.equal(migration.enabled, false);
      assert.equal(await migration.status({ list: async () => [{ id: 'official.labeledit', version: '9.0.0' }] }), null);
      await migration.dismiss();
      assert.equal(await (await preparePluginMigration(root)).status(manager), null);
    } finally { await rm(root, { recursive: true, force: true }); }
  }
});

test('postponed legacy restoration retains disabled state without probing the restored plugin', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'qingzuo-postponed-'));
  try {
    await mkdir(path.join(root, 'harness/profiles/commerce-desktop'), { recursive: true });
    await writeFile(path.join(root, 'harness/profiles/commerce-desktop/package.json'), '{}');
    await mkdir(path.join(root, 'plugins'));
    await writeFile(path.join(root, 'plugins/state.json'), JSON.stringify({ plugins: { 'official.labeledit': { enabled: false } } }));
    const migration = await preparePluginMigration(root);
    await migration.dismiss();
    const manager = new PluginManager(path.join(root, 'plugins'), path.join(root, 'no-bundled-plugins'), { probe: async () => { throw new Error('Disabled restoration must not start the plugin.'); } });
    await manager.initialize();
    assert.equal(await migration.status(manager), null);
    const archive = new AdmZip();
    archive.addFile('package.json', Buffer.from(JSON.stringify({ name: 'legacy-fixture', version: '0.1.2', commerce: { manifestVersion: 1, id: 'official.labeledit', title: 'Fixture', description: 'Legacy restore', api: '^1.1.0', ui: 'ui/index.html', permissions: {} } })));
    archive.addFile('ui/index.html', Buffer.from('<h1>Fixture</h1>'));
    await manager.install(archive.toBuffer());
    assert.equal((await manager.get('official.labeledit')).enabled, false);
    const restarted = new PluginManager(path.join(root, 'plugins'), path.join(root, 'no-bundled-plugins'));
    await restarted.initialize();
    assert.equal((await restarted.get('official.labeledit')).enabled, false);
  } finally { await rm(root, { recursive: true, force: true }); }
});
