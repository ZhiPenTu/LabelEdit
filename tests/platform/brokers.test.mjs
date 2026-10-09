import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { FileBroker, NetworkBroker } from '../../desktop/brokers.mjs';
const plugin = { id: 'local.a', title: 'Fixture', permissions: { files: true, credentials: ['removebg'], network: ['https://api.remove.bg'] } };
test('file tokens are private per plugin and become invalid on disposal', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'commerce-files-')); const files = new FileBroker(root, {});
  try { const file = await files.create(plugin, Buffer.from('test'), 'a.png', 'image/png'); assert.equal((await files.read(plugin, file.token)).data, Buffer.from('test').toString('base64')); await assert.rejects(files.read({ ...plugin, id: 'local.b' }, file.token)); await files.revoke(plugin.id); await assert.rejects(files.read(plugin, file.token)); }
  finally { await rm(root, { recursive: true, force: true }); }
});
test('network broker validates endpoint, isolates secrets, saves PNG and never retries failures', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'commerce-net-')); const files = new FileBroker(root, {}); const file = await files.create(plugin, Buffer.from('image'), 'a.png', 'image/png'); let calls = 0;
  const opts = { url: 'https://api.remove.bg/v1.0/removebg', fileToken: file.token, credential: 'removebg' };
  const broker = new NetworkBroker(files, { get: async () => 'fixture-secret' }, async (url, request) => { calls++; assert.equal(url, opts.url); assert.equal(request.redirect, 'error'); assert.equal(request.headers['X-Api-Key'], 'fixture-secret'); return new Response(Buffer.from([137,80,78,71,13,10,26,10,1]), { headers: { 'content-type': 'image/png' } }); });
  try { const result = await broker.call(plugin, opts); assert.equal(result.mime, 'image/png'); assert.equal(calls, 1); await assert.rejects(broker.call(plugin, { ...opts, url: 'https://attacker.example' })); assert.equal(calls, 1);
    const denied = new NetworkBroker(files, { get: async () => 'fixture-secret' }, async () => { calls++; return new Response('', { status: 402 }); }); await assert.rejects(denied.call(plugin, opts), /额度不足/); assert.equal(calls, 2);
    const missing = new NetworkBroker(files, { get: async () => null }, () => { throw new Error('must not fetch'); }); await assert.rejects(missing.call(plugin, opts), /配置/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
test('cancelled HTTP task is not automatically resubmitted', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'commerce-cancel-')); const files = new FileBroker(root, {}), file = await files.create(plugin, Buffer.from('image'), 'a.png', 'image/png'); let calls = 0;
  const broker = new NetworkBroker(files, { get: async () => 'fixture-secret' }, async (_url, request) => { calls++; return new Promise((_resolve, reject) => request.signal.addEventListener('abort', () => reject(new Error('aborted')))); });
  try { const task = broker.call(plugin, { url: 'https://api.remove.bg/v1.0/removebg', fileToken: file.token, credential: 'removebg', taskId: 'test' }); await new Promise(r => setTimeout(r, 50)); assert.equal(calls, 1); broker.cancel(plugin.id, 'test'); await assert.rejects(task, /取消/); assert.equal(calls, 1); }
  finally { await rm(root, { recursive: true, force: true }); }
});
