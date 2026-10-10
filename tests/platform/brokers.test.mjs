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

test('generic response limits distinguish ordinary and private file responses without retrying', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'qingzuo-limits-')), files = new FileBroker(root, {});
  let calls = 0, length = 9 * 1024 ** 2;
  const broker = new NetworkBroker(files, {}, async () => { calls++; return new Response(Buffer.alloc(length)); });
  try {
    const options = { url: 'https://api.remove.bg/data' };
    await assert.rejects(broker.call(plugin, options));
    const result = await broker.call(plugin, { ...options, responseType: 'file' });
    assert.equal(result.file.size, length);
    length = 65 * 1024 ** 2;
    await assert.rejects(broker.call(plugin, { ...options, responseType: 'file' }));
    assert.equal(calls, 3);
  } finally { await rm(root, { recursive: true, force: true }); }
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
test('generic declared online services use scoped credentials and return bounded data',async()=>{
 const p={...plugin,permissions:{...plugin.permissions,network:['https://tools.example.com']}},broker=new NetworkBroker(null,{get:async()=> 'fixture'},async(url,request)=>{assert.equal(url,'https://tools.example.com/task');assert.equal(request.headers.Authorization,'Bearer fixture');assert.equal(request.body,'{"input":1}');return new Response('{"output":2}');});
 const result=await broker.call(p,{url:'https://tools.example.com/task',method:'POST',json:{input:1},credential:'removebg'});assert.equal(result.status,200);assert.equal(Buffer.from(result.data,'base64').toString(),'{"output":2}');await assert.rejects(broker.call(p,{url:'https://tools.example.com/task',credential:'unscoped'}));
});
test('private resource URLs and release reject other plugin tokens', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'qingzuo-resource-')), files = new FileBroker(root, {});
  try {
    const item = await files.create(plugin, Buffer.from('image'), 'image.png', 'image/png');
    assert.equal(await files.url(plugin, item.token), 'commerce-plugin://' + plugin.id + '/__files/' + item.token);
    await assert.rejects(files.url({ ...plugin, id: 'local.other' }, item.token));
    await assert.rejects(files.release({ ...plugin, id: 'local.other' }, item.token));
    await files.release(plugin, item.token);
    await assert.rejects(files.read(plugin, item.token));
  } finally { await rm(root, { recursive: true, force: true }); }
});
test('generic multipart uploads scope credentials, preserve HTTP errors and produce file tokens', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'qingzuo-multipart-')), files = new FileBroker(root, {});
  let calls = 0;
  const broker = new NetworkBroker(files, { get: async () => 'private' }, async (_url, request) => {
    calls++;
    assert.equal(request.headers['X-Api-Key'], 'private');
    assert.equal(request.body.get('format'), 'png');
    assert.equal(await request.body.get('image').text(), 'input');
    return new Response('quota', { status: 402, headers: { 'Content-Type': 'text/plain' } });
  });
  try {
    const input = await files.create(plugin, Buffer.from('input'), 'input.png', 'image/png');
    const options = { url: 'https://api.remove.bg/v1.0/removebg', method: 'POST', credential: 'removebg', credentialHeader: 'X-Api-Key', multipart: { fields: { format: 'png' }, files: [{ field: 'image', token: input.token }] }, responseType: 'file' };
    const result = await broker.call(plugin, options);
    assert.equal(result.status, 402);
    assert.equal(Buffer.from((await files.read(plugin, result.file.token)).data, 'base64').toString(), 'quota');
    await assert.rejects(broker.call(plugin, { ...options, json: {} }));
    await assert.rejects(broker.call({ ...plugin, id: 'local.other' }, options));
    const oversized = await files.create(plugin, Buffer.alloc(26 * 1024 ** 2), 'large', 'application/octet-stream');
    await assert.rejects(broker.call(plugin, { ...options, multipart: { files: [{ field: 'image', token: oversized.token }] } }), /25 MB/);
    assert.equal(calls, 1);
  } finally { await rm(root, { recursive: true, force: true }); }
});
