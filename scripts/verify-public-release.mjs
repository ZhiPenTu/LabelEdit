import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { load } from 'js-yaml';
import { readComponentManifest, componentManifestName } from '../desktop/update-components.mjs';

const [metadataFile, directory] = process.argv.slice(2);
assert.ok(metadataFile && directory, 'Public Release metadata and downloaded asset directory required.');
const release = JSON.parse(await readFile(metadataFile, 'utf8'));
const { version } = JSON.parse(await readFile('package.json', 'utf8'));
assert.equal(release.tag_name, 'v' + version);
assert.ok(release.html_url === 'https://github.com/ZhiPenTu/qingzuo-desktop/releases/tag/v' + version || release.html_url === 'https://github.com/ZhiPenTu/LabelEdit/releases/tag/v' + version, 'Release HTML URL mismatch: ' + release.html_url);
assert.equal(release.draft, false);
assert.equal(release.prerelease, false);
const mac = `CommerceTools-${version}-mac-arm64`, windows = `CommerceTools-${version}-win-x64`;
const required = new Set([mac + '.dmg', mac + '.zip', windows + '.exe', 'latest-mac.yml', 'latest.yml', componentManifestName(version), ...['core', 'electron', 'dependencies'].map(id => mac + '.' + id + '.zip')]);
const allowed = new Set([...required, mac + '.dmg.blockmap', mac + '.zip.blockmap', windows + '.exe.blockmap']);
const verified = new Map();
for (const asset of release.assets) {
  assert.ok(allowed.has(asset.name) && !verified.has(asset.name), 'Unexpected or duplicate public asset: ' + asset.name);
  assert.ok(asset.browser_download_url === `https://github.com/ZhiPenTu/qingzuo-desktop/releases/download/v${version}/${asset.name}` || asset.browser_download_url === `https://github.com/ZhiPenTu/LabelEdit/releases/download/v${version}/${asset.name}`, 'Asset download URL mismatch: ' + asset.browser_download_url);
  const filename = path.join(directory, asset.name), sha256 = createHash('sha256'), sha512 = createHash('sha512');
  assert.equal((await stat(filename)).size, asset.size, 'Asset size mismatch: ' + asset.name);
  for await (const bytes of createReadStream(filename)) { sha256.update(bytes); sha512.update(bytes); }
  const digest = sha256.digest('hex');
  assert.equal(asset.digest, 'sha256:' + digest, 'GitHub public asset digest mismatch: ' + asset.name);
  verified.set(asset.name, { size: asset.size, sha256: digest, sha512: sha512.digest('base64') });
}
for (const name of required) assert.ok(verified.has(name), 'Missing public asset: ' + name);
const manifest = readComponentManifest(await readFile(path.join(directory, componentManifestName(version))), process.env.COMMERCE_PLUGIN_PUBLIC_KEY, version);
assert.deepEqual(manifest.components.map(component => component.id).sort(), ['core', 'dependencies', 'electron']);
assert.equal(manifest.files.some(file => file.path.startsWith('Contents/Resources/commerce/plugins/')), false);
for (const component of manifest.components) {
  const name = new URL(component.artifact.url).pathname.split('/').at(-1), asset = verified.get(name);
  assert.equal(asset?.size, component.artifact.size);
  assert.equal(asset?.sha256, component.artifact.sha256);
}
for (const [name, installer] of [['latest-mac.yml', mac + '.zip'], ['latest.yml', windows + '.exe']]) {
  const update = load(await readFile(path.join(directory, name), 'utf8'));
  assert.equal(update.version, version);
  assert.ok(update.files?.some(file => file.url === installer), 'Missing updater target: ' + name);
  for (const file of update.files) {
    const asset = verified.get(file.url);
    assert.ok(asset && [mac + '.zip', mac + '.dmg', windows + '.exe'].includes(file.url));
    assert.equal(file.sha512, asset.sha512, 'Updater SHA-512 mismatch: ' + file.url);
    if (file.size !== undefined) assert.equal(file.size, asset.size);
  }
  assert.equal(update.sha512, verified.get(update.path)?.sha512);
}
const evidence = { version, release: release.html_url, componentSignature: 'verified with the existing desktop public key', components: manifest.components.map(component => component.id), assets: Object.fromEntries(verified) };
await writeFile(path.join(directory, 'verification.json'), JSON.stringify(evidence, null, 2));
console.log('Public installers, updater SHA-512, GitHub SHA-256 and three-component signatures verified: ' + release.html_url);
