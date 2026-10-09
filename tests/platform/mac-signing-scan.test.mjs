import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
const execute = promisify(execFile), require = createRequire(import.meta.url);
const { limitBinaryScan } = require('../../desktop/mac-signing-scan.cjs');

test('bounded detector drains successes and errors without dropping classifications or exceeding concurrency', async () => {
  let active = 0, maximum = 0;
  const detector = { async isBinaryFile(value) { active++; maximum = Math.max(maximum, active); try { await new Promise(resolve => setTimeout(resolve, 1)); if (value === 17) throw new Error('fixture'); return value % 2 === 0; } finally { active--; } } };
  limitBinaryScan(detector, 8); const original = detector.isBinaryFile; limitBinaryScan(detector); assert.equal(detector.isBinaryFile, original);
  const result = await Promise.allSettled(Array.from({ length: 100 }, (_, index) => detector.isBinaryFile(index)));
  assert.equal(maximum, 8); assert.equal(result[17].status, 'rejected'); assert.equal(result[98].value, true); assert.equal(result[99].value, false); assert.equal(active, 0);
});

test('the actual upstream signing walker scans a large tree under a 256 descriptor limit', { skip: process.platform !== 'darwin' }, async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'qingzuo-sign-scan-'));
  try {
    const folder = path.join(root, 'tree'); await mkdir(folder);
    for (let index = 0; index < 3000; index++) await writeFile(path.join(folder, index + '.js'), 'export const value = 1;');
    await writeFile(path.join(folder, 'fixture.node'), Buffer.from([0, 1, 0, 2]));
    const code = 'const signer = require("@electron/osx-sign"); require(process.argv[1]).limitMacBinaryScan(); signer.walkAsync(process.argv[2]).then(files => process.stdout.write(JSON.stringify(files))).catch(error => { console.error(error); process.exit(1); });';
    const result = await execute('/bin/sh', ['-c', 'ulimit -S -n 256\nexec "$@"', 'scan-fixture', process.execPath, '--input-type=commonjs', '-e', code, path.resolve('desktop/mac-signing-scan.cjs'), folder], { timeout: 60000 });
    assert.deepEqual(JSON.parse(result.stdout), [path.join(folder, 'fixture.node')]);
  } finally { await rm(root, { recursive: true, force: true }); }
});
