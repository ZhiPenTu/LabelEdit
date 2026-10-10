import { test, expect, _electron } from '@playwright/test';
import { mkdir, mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import AdmZip from 'adm-zip';

test('legacy recovery is explicit, offline-safe, state-preserving and recorded per profile', async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'qingzuo-migration-ui-'));
  const configFile = path.resolve('resources/generated/market.json'), originalConfig = await readFile(configFile);
  const keys = generateKeyPairSync('ed25519'), profile = path.join(temporary, 'profile');
  let app;
  try {
    await mkdir(path.join(profile, 'harness/profiles/commerce-desktop'), { recursive: true });
    await writeFile(path.join(profile, 'harness/profiles/commerce-desktop/package.json'), '{}');
    await mkdir(path.join(profile, 'plugins'));
    await writeFile(path.join(profile, 'plugins/state.json'), JSON.stringify({ plugins: { 'official.labeledit': { enabled: false } } }));
    await writeFile(path.join(profile, 'user-document.pdf'), 'preserved document');
    await writeFile(configFile, JSON.stringify({ url: 'https://market.example/catalog.json', publicKey: keys.publicKey.export({ type: 'spki', format: 'pem' }) }));
    app = await _electron.launch({ args: [process.cwd(), '--user-data-dir=' + profile] });
    const page = await app.firstWindow();
    await expect(page.getByText('Harness 内核已连接')).toBeVisible();
    await expect(page.getByRole('button', { name: '恢复 LabelEdit', exact: true })).toBeVisible();
    await app.evaluate(() => { globalThis.fetch = async () => { throw new Error('offline'); }; });
    await page.getByRole('button', { name: '恢复 LabelEdit', exact: true }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'offline' })).toBeVisible();
    expect((await page.evaluate(() => window.commerceDesktop.invoke('status'))).plugins).toEqual([]);
    const zip = new AdmZip();
    zip.addFile('package.json', Buffer.from(JSON.stringify({ version: '0.1.2', commerce: { manifestVersion: 1, id: 'official.labeledit', title: 'LabelEdit', description: '', api: '^1.1.0', ui: 'ui/index.html', permissions: {} } })));
    zip.addFile('ui/index.html', Buffer.from('<h1>Recovery fixture</h1>'));
    const bytes = zip.toBuffer(), catalog = { schemaVersion: 1, plugins: [{ id: 'official.labeledit', title: 'LabelEdit', description: '', version: '0.1.2', api: '^1.1.0', artifacts: { [process.platform + '-' + process.arch]: { url: 'https://market.example/plugin.ecplugin', size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), signature: sign(null, bytes, keys.privateKey).toString('base64') } } }] };
    await app.evaluate((_, value) => { globalThis.fetch = async url => new Response(String(url).endsWith('catalog.json') ? JSON.stringify(value.catalog) : Buffer.from(value.bytes, 'base64')); }, { catalog, bytes: bytes.toString('base64') });
    await page.getByRole('button', { name: '恢复 LabelEdit', exact: true }).click();
    await expect(page.getByRole('button', { name: '恢复 LabelEdit', exact: true })).toHaveCount(0);
    expect((await page.evaluate(() => window.commerceDesktop.invoke('status'))).plugins[0].enabled).toBe(false);
    expect(await readFile(path.join(profile, 'user-document.pdf'), 'utf8')).toBe('preserved document');
    await app.close(); app = null;
    app = await _electron.launch({ args: [process.cwd(), '--user-data-dir=' + profile] });
    const reopened = await app.firstWindow();
    await expect(reopened.getByText('Harness 内核已连接')).toBeVisible();
    const status = await reopened.evaluate(() => window.commerceDesktop.invoke('status'));
    expect(status.migration).toBeNull();
    expect(status.plugins[0]).toMatchObject({ version: '0.1.2', enabled: false });
  } finally { await app?.close(); await writeFile(configFile, originalConfig); await rm(temporary, { recursive: true, force: true }); }
});
