import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { preparePluginMigration } from '../../desktop/plugin-migration.mjs';

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
