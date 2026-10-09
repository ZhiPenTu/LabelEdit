import { _electron, expect } from '@playwright/test';
import { cp, mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const sourceExecutable = path.resolve(process.argv[2] || (process.platform === 'darwin'
  ? 'release/desktop/mac-arm64/Qingzuo.app/Contents/MacOS/Qingzuo'
  : 'release/desktop/win-unpacked/Qingzuo.exe'));
const temporary = await mkdtemp(path.join(os.tmpdir(), 'commerce-packaged-'));
let app;
try {
  // Installed applications cannot borrow peer dependencies from a developer
  // checkout. Copy the whole distribution and launch it outside the repository.
  const sourceRoot = process.platform === 'darwin' ? path.resolve(sourceExecutable, '../../..') : path.dirname(sourceExecutable);
  const installedRoot = path.join(temporary, path.basename(sourceRoot));
  await cp(sourceRoot, installedRoot, { recursive: true, verbatimSymlinks: true });
  const executablePath = path.join(installedRoot, path.relative(sourceRoot, sourceExecutable));
  const env = { ...process.env }; delete env.NODE_PATH; delete env.NODE_OPTIONS;
  app = await _electron.launch({ executablePath, cwd: temporary, env, args: ['--user-data-dir=' + path.join(temporary, 'data')], timeout: 30000 });
  app.process().stderr.on('data', bytes => process.stderr.write(bytes));
  const page = await app.firstWindow();
  await expect.poll(async () => {
    const current = await page.evaluate(() => window.commerceDesktop.invoke('status'));
    if (current.kernel.error) throw new Error(current.kernel.error);
    return current.kernel.systems.length;
  }, { timeout: 30000 }).toBe(7);
  await expect(page.getByText('Harness 内核已连接')).toBeVisible();
  const status = await page.evaluate(() => window.commerceDesktop.invoke('status'));
  expect(status.update.status).toBe('idle');
  await page.getByRole('button', { name: '更新', exact: true }).click();
  await expect(page.getByText('下载完成后将自动安装并重启，请先保存正在编辑的文件。', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '工具中心', exact: true }).click();
  await mkdir('output/electron-tests', { recursive: true });
  await page.screenshot({ path: 'output/electron-tests/packaged-home.png' });
  await page.locator('[data-slot="card"]').filter({ hasText: 'LabelEdit' }).getByRole('button', { name: '打开工具' }).click();
  await expect.poll(() => app.context().pages().some(p => p.url().startsWith('commerce-plugin://official.labeledit/'))).toBe(true);
  const label = app.context().pages().find(p => p.url().startsWith('commerce-plugin://official.labeledit/'));
  await label.getByRole('button', { name: '使用示例标签' }).click();
  await expect(label.getByRole('button', { name: '选择文字：Batch Number: SG250128', exact: true })).toBeVisible({ timeout: 30000 });
  const output = path.join(temporary, 'result.pdf');
  await app.evaluate(({ dialog }, file) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: file }); }, output);
  await label.getByRole('button', { name: '导出 PDF', exact: true }).click();
  await expect.poll(async () => { try { return (await readFile(output)).subarray(0, 4).toString(); } catch { return ''; } }).toBe('%PDF');
  console.log('Standalone installed application outside the checkout: own UI, Harness kernel, sandboxed offline OCR and saved PDF passed.');
} finally {
  if (app) await app.close();
  await rm(temporary, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
}
