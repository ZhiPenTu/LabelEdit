import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { latestReleaseNotes, checkGitHubRelease } from '../../desktop/updates.mjs';

const assets = ['mac-arm64.zip', 'win-x64.exe'].map(target => ({ name: `CommerceTools-0.3.0-${target}`, state: 'uploaded', size: 10, digest: `sha256:${createHash('sha256').update('test').digest('hex')}`, browser_download_url: 'https://untrusted.example' }));
const release = { tag_name: 'v0.3.0', draft: false, prerelease: false, body: '最新版本变更', assets };
const options = (value = release) => ({ fetchImpl: async () => new Response(JSON.stringify(value)), platform: 'darwin', arch: 'arm64' });

test('release notes display only the target version', () => {
  assert.equal(latestReleaseNotes({ version: '0.3.0', releaseNotes: [{ version: '0.3.0', note: 'latest' }, { version: '0.2.0', note: 'history' }] }), 'latest');
  assert.equal(latestReleaseNotes({ version: '0.3.0', releaseNotes: [{ version: '0.2.0', note: 'history' }] }), '');
  assert.equal(latestReleaseNotes({ releaseNotes: 'markdown' }), 'markdown');
});

test('release checks select the archive with a fixed repository URL and verified digest metadata', async () => {
  let requested;
  const result = await checkGitHubRelease('0.2.0', { ...options(), fetchImpl: async (url, init) => { requested = url; assert.ok(init.signal); return new Response(JSON.stringify(release)); } });
  assert.equal(requested, 'https://api.github.com/repos/ZhiPenTu/LabelEdit/releases/latest');
  assert.deepEqual(result, { status: 'available', version: '0.3.0', notes: release.body, artifact: { url: 'https://github.com/ZhiPenTu/LabelEdit/releases/download/v0.3.0/CommerceTools-0.3.0-mac-arm64.zip', size: 10, sha256: assets[0].digest.slice(7) } });
  assert.equal((await checkGitHubRelease('0.2.0', { ...options(), platform: 'win32', arch: 'x64' })).status, 'available');
  for (const version of ['0.3.0', '0.4.0']) assert.deepEqual(await checkGitHubRelease(version, options()), { status: 'current', version: null, notes: '' });
});

test('release checks reject incomplete, unverified or malformed releases and report network failures', async () => {
  assert.deepEqual(await checkGitHubRelease('0.2.0', { ...options(), fetchImpl: async () => new Response('', { status: 404 }) }), { status: 'unpublished', version: null, notes: '' });
  for (const invalid of [
    { ...release, assets: [] }, { ...release, assets: {} }, { ...release, prerelease: true }, { ...release, draft: true },
    ...['other-release', '0.3.0', 'v0.3.0-beta.1', 'v0.1.4', 'v0.3.0/../../other'].map(tag_name => ({ ...release, tag_name })),
    ...[{ digest: null }, { size: -1 }, { size: 3 * 1024 ** 3 }, { digest: 'sha256:invalid' }].map(override => ({ ...release, assets: [{ ...assets[0], ...override }] })),
  ]) await assert.rejects(checkGitHubRelease('0.2.0', options(invalid)));
  await assert.rejects(checkGitHubRelease('0.2.0', { ...options(), fetchImpl: async () => new Response('', { status: 429 }) }), /HTTP 429/);
  await assert.rejects(checkGitHubRelease('0.2.0', { ...options(), fetchImpl: async () => new Response('x'.repeat(1024 * 1024 + 1)) }), /响应过大/);
});
