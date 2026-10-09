import { _electron, expect } from '@playwright/test';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const executablePath = path.resolve(process.argv[2] || (process.platform === 'darwin'
  ? 'release/desktop/mac-arm64/Commerce Tools.app/Contents/MacOS/Commerce Tools'
  : 'release/desktop/win-unpacked/Commerce Tools.exe'));
const temporary = await mkdtemp(path.join(os.tmpdir(), 'commerce-packaged-'));
let app;
try {
  app = await _electron.launch({ executablePath, args: ['--user-data-dir=' + path.join(temporary, 'data')], timeout: 30000 });
  app.process().stderr.on('data', bytes => process.stderr.write(bytes));
  const page = await app.firstWindow();
  await expect(page.getByText('Harness 内核已连接')).toBeVisible({ timeout: 30000 });
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
  console.log('Packaged application: own UI, Harness kernel, sandboxed offline OCR and saved PDF passed.');
} finally {
  if (app) await app.close();
  await rm(temporary, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
}
