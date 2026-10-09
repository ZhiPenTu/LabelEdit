import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, mkdir, writeFile, access } from 'node:fs/promises';
import { execFile, spawn } from 'node:child_process';
import { once } from 'node:events';
import { promisify } from 'node:util';
import path from 'node:path';
import os from 'node:os';
import { applicationBundle, prepareMacUpdate, launchMacInstaller, previousUpdateError } from '../../desktop/mac-update.mjs';
const execute = promisify(execFile);
test('update targets reject disk images, translocated applications and development executables', { skip: process.platform !== 'darwin' }, () => {
  assert.equal(applicationBundle('/Applications/Commerce Tools.app/Contents/MacOS/Commerce Tools'), '/Applications/Commerce Tools.app');
  for (const filename of ['/Volumes/Qingzuo/Qingzuo.app/Contents/MacOS/Qingzuo', '/private/var/AppTranslocation/random/Qingzuo.app/Contents/MacOS/Qingzuo', '/usr/bin/node']) assert.throws(() => applicationBundle(filename));
});

async function makeBundle(folder, name, id = 'com.commerce.tools.desktop') {
  const app = path.join(folder, `${name}.app`);
  await mkdir(path.join(app, 'Contents/MacOS'), { recursive: true });
  await writeFile(path.join(app, 'Contents/Info.plist'), `<?xml version="1.0"?><plist version="1.0"><dict><key>CFBundleIdentifier</key><string>${id}</string><key>CFBundleExecutable</key><string>fixture</string><key>CFBundleShortVersionString</key><string>0.2.4</string><key>CFBundlePackageType</key><string>APPL</string></dict></plist>`);
  const source = path.join(folder, `${name}.c`);
  // LaunchServices invokes a harmless fixture that records its actual launch.
  await writeFile(source, '#include <stdio.h>\n#include <mach-o/dyld.h>\nint main(void) { char p[4096]; uint32_t n=sizeof(p); _NSGetExecutablePath(p,&n); char f[4200]; snprintf(f,sizeof(f),"%s.started",p); FILE *o=fopen(f,"w"); if(o){fputs("started",o);fclose(o);} return 0; }');
  const sdk = (await execute('/usr/bin/xcrun', ['--sdk', 'macosx', '--show-sdk-path'])).stdout.trim();
  await execute('/usr/bin/cc', ['-isysroot', sdk, source, '-o', path.join(app, 'Contents/MacOS/fixture')]);
  await execute('/usr/bin/codesign', ['--force', '--sign', '-', app]);
  return app;
}

test('macOS extracts real ZIPs and rejects mismatched versions, bundle identities and invalid signatures', { skip: process.platform !== 'darwin', timeout: 60000 }, async () => {
  const folder = await mkdtemp(path.join(os.tmpdir(), 'qingzuo-archive-'));
  try {
    const app = await makeBundle(folder, 'Qingzuo');
    const archive = path.join(folder, 'update.zip');
    await execute('/usr/bin/ditto', ['-c', '-k', '--sequesterRsrc', '--keepParent', app, archive]);
    const staging = await mkdtemp(path.join(folder, 'stage-'));
    assert.ok((await prepareMacUpdate(archive, staging, '0.2.4')).endsWith('Qingzuo.app'));
    await assert.rejects(prepareMacUpdate(archive, await mkdtemp(path.join(folder, 'stage-')), '0.2.5'), /版本不匹配/);
    await writeFile(path.join(app, 'Contents/MacOS/fixture'), 'broken binary');
    await execute('/usr/bin/ditto', ['-c', '-k', '--keepParent', app, archive]);
    await assert.rejects(prepareMacUpdate(archive, await mkdtemp(path.join(folder, 'stage-')), '0.2.4'));
    const other = await makeBundle(folder, 'Other', 'test.other');
    await execute('/usr/bin/ditto', ['-c', '-k', '--keepParent', other, archive]);
    await assert.rejects(prepareMacUpdate(archive, await mkdtemp(path.join(folder, 'stage-')), '0.2.4'));
  } finally { await rm(folder, { recursive: true, force: true }); }
});

test('detached macOS helper waits for exit, replaces the app, relaunches it and rolls back a failed replacement', { skip: process.platform !== 'darwin', timeout: 60000 }, async () => {
  // Spaces and shell metacharacters must be passed literally, never evaluated.
  const folder = await mkdtemp(path.join(os.tmpdir(), "qingzuo update '$-"));
  try {
    const target = await makeBundle(folder, 'Old', `test.qingzuo.update.${Date.now()}`);
    const receipt = path.join(folder, 'receipt.txt');
    const profile = path.join(folder, 'profile');
    await mkdir(profile); await writeFile(path.join(profile, 'preferences'), 'preserve');
    const staging = await mkdtemp(path.join(folder, 'stage-'));
    const prepared = await makeBundle(staging, 'New', `test.qingzuo.new.${Date.now()}`);
    await writeFile(path.join(prepared, 'version-marker'), 'new');
    const parent = spawn('/bin/sleep', ['2']);
    const helper = await launchMacInstaller({ target, prepared, staging, receipt, profile, parent: parent.pid });
    const exited = once(helper, 'exit'); helper.ref();
    await access(target); await access(prepared);
    assert.equal((await exited)[0], 0);
    assert.equal(await readFile(path.join(target, 'version-marker'), 'utf8'), 'new');
    // open(1) returning is a launch handoff; wait for the actual fixture process.
    for (let i = 0; i < 100; i++) { try { await access(path.join(target, 'Contents/MacOS/fixture.started')); break; } catch { await new Promise(resolve => setTimeout(resolve, 100)); } }
    await access(path.join(target, 'Contents/MacOS/fixture.started'));
    await assert.rejects(access(staging));
    assert.equal(await readFile(path.join(profile, 'preferences'), 'utf8'), 'preserve');
    const failedStage = await mkdtemp(path.join(folder, 'stage-'));
    const waiter = spawn('/bin/sleep', ['1']);
    const failed = await launchMacInstaller({ target, prepared: path.join(failedStage, 'missing.app'), staging: failedStage, receipt, profile, parent: waiter.pid });
    const failure = once(failed, 'exit'); failed.ref(); assert.equal((await failure)[0], 1);
    assert.equal(await readFile(path.join(target, 'version-marker'), 'utf8'), 'new');
    assert.match(await previousUpdateError(receipt), /恢复原版本/);
    assert.equal(await previousUpdateError(receipt), null);
  } finally { await rm(folder, { recursive: true, force: true }); }
});
