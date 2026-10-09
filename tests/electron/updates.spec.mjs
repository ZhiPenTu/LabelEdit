import { test, expect, _electron as electron } from '@playwright/test';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

test('unsigned desktop shows latest release notes and opens GitHub without automatic installation', async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'commerce-updates-ui-'));
  const config = path.resolve('resources/generated/distribution.json');
  const previous = await readFile(config);
  let application;
  try {
    await writeFile(config, JSON.stringify({ signing: 'unsigned' }));
    application = await electron.launch({ args: [process.cwd(), '--user-data-dir=' + path.join(temp, 'data')], timeout: 20000 });
    const page = await application.firstWindow();
    await expect(page.getByText('Harness 内核已连接')).toBeVisible();
    await application.evaluate(({ app, shell }) => {
      Object.defineProperty(app, 'isPackaged', { value: true });
      globalThis.commerceUpdateHTTPStatus = 200;
      globalThis.commerceOpenedReleaseURL = null;
      globalThis.fetch = async address => {
        if (String(address) !== 'https://api.github.com/repos/ZhiPenTu/LabelEdit/releases/latest') throw new Error('Unexpected update request');
        return new Response(JSON.stringify({ tag_name: 'v0.3.0', draft: false, prerelease: false, body: '最新变更：新增工具预览', html_url: 'https://untrusted.example', assets: [{ name: 'CommerceTools-0.3.0-mac-arm64.dmg', state: 'uploaded' }, { name: 'CommerceTools-0.3.0-win-x64.exe', state: 'uploaded' }] }), { status: globalThis.commerceUpdateHTTPStatus });
      };
      shell.openExternal = async address => { globalThis.commerceOpenedReleaseURL = address; };
    });
    await page.getByRole('button', { name: '更新', exact: true }).click();
    await expect(page.getByText('从 GitHub 下载新版安装包后手动安装。', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: '检查更新', exact: true }).click();
    await expect(page.getByText('检测到版本 v0.3.0', { exact: true })).toBeVisible();
    await expect(page.getByText('最新变更：新增工具预览', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '安装并重启', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: '下载更新', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: '打开 GitHub 下载页', exact: true }).click();
    expect(await application.evaluate(() => globalThis.commerceOpenedReleaseURL)).toBe('https://github.com/ZhiPenTu/LabelEdit/releases/tag/v0.3.0');
    for (const method of ['updates.download', 'updates.install']) {
      const error = await page.evaluate(async name => {
        try { await window.commerceDesktop.invoke(name); return null; } catch (failure) { return failure.message; }
      }, method);
      expect(error).toContain('手动安装');
    }
    if (process.env.COMMERCE_QA_SCREENSHOT) {
      await mkdir(path.dirname(process.env.COMMERCE_QA_SCREENSHOT), { recursive: true });
      await page.screenshot({ path: process.env.COMMERCE_QA_SCREENSHOT });
    }
    await application.evaluate(() => { globalThis.commerceUpdateHTTPStatus = 429; });
    await page.getByRole('button', { name: '检查更新', exact: true }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'HTTP 429' }).first()).toBeVisible();
    await expect(page.getByText('最新变更：新增工具预览', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: '打开 GitHub 下载页', exact: true })).toHaveCount(0);
    await application.evaluate(() => { globalThis.commerceUpdateHTTPStatus = 404; });
    await page.getByRole('button', { name: '检查更新', exact: true }).click();
    await expect(page.getByText('尚无公开发布的底座版本。', { exact: true })).toBeVisible();
    await expect(page.getByRole('alert')).toHaveCount(0);
  } finally {
    if (application) await application.close();
    await writeFile(config, previous);
    await rm(temp, { recursive: true, force: true });
  }
});
