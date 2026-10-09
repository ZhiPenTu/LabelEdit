import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, realpath } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { launchSandbox, RpcWorker } from '../../desktop/sandbox.mjs';
const launcher = path.resolve('native/sandbox/target/release/commerce-sandbox' + (process.platform === 'win32' ? '.exe' : ''));
test('real OS sandbox allows its workdir and blocks outside reads/writes, links, sockets and foreign executables', { timeout: 30000 }, async () => {
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), 'commerce-sandbox-'))), code = path.join(root, 'code'), job = path.join(root, 'job'), foreign = path.join(root, 'foreign');
  await Promise.all([mkdir(code), mkdir(job), mkdir(foreign)]); const sentinel = path.join(foreign, 'sentinel.txt'); await writeFile(sentinel, 'PRIVATE_FIXTURE');
  const script = path.join(code, 'probe.mjs');
  await writeFile(script, await readFile(new URL('../fixtures/sandbox-probe.mjs', import.meta.url)));
  let worker;
  try { const executable = await realpath(process.execPath); const child = await launchSandbox({ executable, args: ['--preserve-symlinks', '--preserve-symlinks-main', script], readOnly: [code, path.dirname(executable)], writable: [job], cwd: job, launcher }); worker = new RpcWorker(child, 15000); assert.equal((await worker.call('health')).ready, true);
    const result = await worker.call('probe', { sentinel }); assert.deepEqual(result, { read: false, write: false, link: false, spawn: false, socket: false }); assert.equal(await readFile(sentinel, 'utf8'), 'PRIVATE_FIXTURE'); assert.equal(await readFile(path.join(job, 'allowed.txt'), 'utf8'), 'OK');
  } finally { await worker?.stop(); await rm(root, { recursive: true, force: true }); }
});
test('missing sandbox launcher fails closed without executing the target', async () => {
  const job = await realpath(await mkdtemp(path.join(os.tmpdir(), 'commerce-closed-'))); let worker;
  try { const child = await launchSandbox({ executable: await realpath(process.execPath), args: ['-e', 'process.exit(0)'], readOnly: [], writable: [job], cwd: job, launcher: path.join(job, 'missing-launcher') }); worker = new RpcWorker(child, 2000); await assert.rejects(worker.call('health'), /SANDBOX_UNAVAILABLE/); }
  finally { await worker?.stop(); await rm(job, { recursive: true, force: true }); }
});
