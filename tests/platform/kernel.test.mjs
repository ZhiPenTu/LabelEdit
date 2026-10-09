import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { bootCommerceKernel } from '../../desktop/kernel.mjs';
test('real Harness profile loads only our seven protected system services and disposes their effects', async () => {
  const home = await mkdtemp(path.join(os.tmpdir(), 'commerce-kernel-'));
  const calls = [];
  try {
    const k = await bootCommerceKernel({ home, installAnchor: path.resolve('package.json'), invoke: async (...args) => { calls.push(args); return ['test']; } });
    assert.deepEqual([...k.systems.keys()], ['home', 'market', 'plugins', 'settings', 'updates', 'credentials', 'sandbox']);
    assert.deepEqual(await k.systems.get('home').invoke('list', {}), ['test']); assert.equal(calls[0][0], 'home');
    assert.equal(k.ctx.get('agents'), undefined); assert.equal(k.ctx.get('webserver'), undefined);
    await k.reconcile([{ id: 'local.fixture', enabled: true, services: { provides: ['local.echo'] } }]);
    assert.ok(k.tools.has('local.echo'));
    assert.deepEqual(await k.call('tool', 'local.echo', 'echo', { text: 'hello' }, 'local.fixture'), ['test']);
    assert.equal(calls.at(-1)[0], 'tool');
    await k.reconcile([]); assert.equal(k.tools.size, 0);
    await assert.rejects(k.call('tool', 'local.echo', 'echo', {}, 'local.fixture'));
    await k.dispose(); assert.equal(k.systems.size, 0);
  } finally { await rm(home, { recursive: true, force: true }); }
});
