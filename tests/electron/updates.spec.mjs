import { test, expect, _electron as electron } from '@playwright/test';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import os from 'node:os';
import path from 'node:path';

test('desktop downloads in-app, keeps progress across navigation, retries and automatically installs', async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'commerce-updates-ui-'));
  let application;
  try {
    application = await electron.launch({ args: [process.cwd(), '--user-data-dir=' + path.join(temp, 'data')], timeout: 20000 });
    const page = await application.firstWindow();
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await expect(page.getByText('Harness 内核已连接')).toBeVisible();
    expect(await page.title()).toBe('轻作 · Qingzuo');
    expect(page.url()).toBe('commerce://shell/index.html');
    await application.evaluate(async ({ app, shell }, moduleURL) => {
      Object.defineProperty(app, 'isPackaged', { value: true });
      const vm = process.getBuiltinModule('node:vm');
      const { updateService } = await vm.runInThisContext('import(' + JSON.stringify(moduleURL) + ')', { importModuleDynamically: vm.constants.USE_MAIN_CONTEXT_DEFAULT_LOADER });
      globalThis.commerceUpdater = updateService;
      globalThis.commerceOpenedURLs = [];
      globalThis.commerceInstallCount = 0;
      shell.openExternal = async url => { globalThis.commerceOpenedURLs.push(url); };
      // Exercise the real service/RPC/renderer; installer side effects use an
      // adapter fixture so this UI test never overwrites an installed app.
      updateService.adapter = {
        check: async () => ({ status: 'available', version: '0.3.0', notes: '最新变更：新增工具预览' }),
        download: async (_release, notify) => {
          notify({ status: 'downloading', progress: 42, transferred: 42 * 1024 ** 2, total: 100 * 1024 ** 2 });
          await new Promise((resolve, reject) => { globalThis.commerceDownloadResolve = resolve; globalThis.commerceDownloadReject = reject; });
          notify({ status: 'extracting', progress: 100 });
          await new Promise(resolve => { globalThis.commerceExtractResolve = resolve; });
          return 'verified-archive';
        },
        install: async prepared => { if (prepared !== 'verified-archive') throw new Error('not prepared'); globalThis.commerceInstallCount++; },
      };
    }, pathToFileURL(path.resolve('desktop/main.mjs')).href);
    await page.getByRole('button', { name: '更新', exact: true }).click();
    await expect(page.getByText('下载完成后将自动安装并重启，请先保存正在编辑的文件。', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: '检查更新', exact: true }).click();
    await expect(page.getByText('检测到版本 v0.3.0', { exact: true })).toBeVisible();
    await expect(page.getByText('最新变更：新增工具预览', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '打开 GitHub 下载页', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: '下载并重启更新', exact: true }).click();
    await expect(page.getByRole('progressbar', { name: '正在下载更新' })).toHaveAttribute('aria-valuenow', '42');
    await expect(page.getByText('42.0 MB / 100.0 MB', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '检查更新', exact: true })).toBeDisabled();
    await page.getByRole('button', { name: '工具中心', exact: true }).click();
    await page.getByRole('button', { name: '更新', exact: true }).click();
    await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '42');
    if (process.env.COMMERCE_QA_SCREENSHOT) {
      await mkdir(path.dirname(process.env.COMMERCE_QA_SCREENSHOT), { recursive: true });
      await page.screenshot({ path: process.env.COMMERCE_QA_SCREENSHOT });
    }
    await application.evaluate(() => { globalThis.commerceDownloadReject(new Error('下载中断，请重试。')); });
    await expect(page.getByRole('alert')).toContainText('下载中断');
    expect(await application.evaluate(() => globalThis.commerceInstallCount)).toBe(0);
    await page.getByRole('button', { name: '重新下载并更新', exact: true }).click();
    await expect(page.getByRole('alert')).toHaveCount(0);
    await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '42');
    await application.evaluate(() => { globalThis.commerceDownloadResolve(); });
    await expect(page.getByText('正在解压并校验更新…', { exact: true })).toBeVisible();
    await application.evaluate(() => { globalThis.commerceExtractResolve(); });
    await expect(page.getByText('正在安装，即将重启…', { exact: true })).toBeVisible();
    expect(await application.evaluate(() => globalThis.commerceInstallCount)).toBe(1);
    expect(await application.evaluate(() => globalThis.commerceOpenedURLs)).toEqual([]);
    expect(errors).toEqual([]);
  } finally {
    if (application) await application.close();
    await rm(temp, { recursive: true, force: true });
  }
});

test('failed checks clear stale release notes and can be retried', async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'commerce-update-check-'));
  let application;
  try {
    application = await electron.launch({ args: [process.cwd(), '--user-data-dir=' + path.join(temp, 'data')] });
    const page = await application.firstWindow();
    await expect(page.getByText('Harness 内核已连接')).toBeVisible();
    await application.evaluate(async ({ app }, moduleURL) => {
      Object.defineProperty(app, 'isPackaged', { value: true });
      const vm = process.getBuiltinModule('node:vm');
      const { updateService } = await vm.runInThisContext('import(' + JSON.stringify(moduleURL) + ')', { importModuleDynamically: vm.constants.USE_MAIN_CONTEXT_DEFAULT_LOADER });
      let attempts = 0;
      updateService.adapter.check = async () => {
        attempts++;
        if (attempts === 1) return { status: 'available', version: '0.3.0', notes: '最新日志' };
        if (attempts === 2) throw new Error('GitHub 更新检查失败（HTTP 429），请稍后重试。');
        return { status: 'unpublished', version: null, notes: '' };
      };
    }, pathToFileURL(path.resolve('desktop/main.mjs')).href);
    await page.getByRole('button', { name: '更新', exact: true }).click();
    await page.getByRole('button', { name: '检查更新', exact: true }).click();
    await expect(page.getByText('最新日志', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: '检查更新', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('HTTP 429');
    await expect(page.getByText('最新日志', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: '下载并重启更新', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: '检查更新', exact: true }).click();
    await expect(page.getByText('尚无公开发布的底座版本。', { exact: true })).toBeVisible();
    await expect(page.getByRole('alert')).toHaveCount(0);
  } finally {
    if (application) await application.close();
    await rm(temp, { recursive: true, force: true });
  }
});
