import { cp, mkdir, readFile, writeFile, access, rm } from 'node:fs/promises';
import path from 'node:path';
import { pack } from '../packages/plugin-sdk/cli.mjs';
import { desktopSigningMode } from '../desktop/distribution.mjs';
const root = process.cwd(), generated = path.join(root, 'resources/generated');
await mkdir(path.join(generated, 'plugins/official.labeledit'), { recursive: true });
await cp(path.join(root, 'plugins/labeledit/package.json'), path.join(generated, 'plugins/official.labeledit/package.json'));
await rm(path.join(generated, 'plugins/official.labeledit/ui'), { recursive: true, force: true });
await cp(path.join(root, 'dist'), path.join(generated, 'plugins/official.labeledit/ui'), { recursive: true });
const backend = path.join(generated, 'plugins/official.labeledit/backend/label-edit-backend');
try { await access(path.join(backend, 'label-edit-backend' + (process.platform === 'win32' ? '.exe' : ''))); }
catch { console.warn('LabelEdit RPC 后端尚未构建；工具中心可测试，本地处理会报告不可用。'); }
const binary = 'commerce-sandbox' + (process.platform === 'win32' ? '.exe' : '');
await cp(path.join(root, 'native/sandbox/target/release', binary), path.join(generated, binary));
await writeFile(path.join(generated, 'market.json'), JSON.stringify({ url: process.env.COMMERCE_MARKET_URL || 'https://raw.githubusercontent.com/ZhiPenTu/LabelEdit/main/market/catalog.json', publicKey: process.env.COMMERCE_PLUGIN_PUBLIC_KEY || '' }));
await writeFile(path.join(generated, 'distribution.json'), JSON.stringify({ signing: desktopSigningMode() }));
await pack(path.join(root, 'plugins/removebg'), path.join(root, 'release/official.removebg-0.1.0.ecplugin'));
await cp(path.join(root, 'node_modules/@deepseek-ai/dsh/LICENSE'), path.join(generated, 'DeepSeek-Harness-LICENSE')).catch(async () => { const response = await fetch('https://raw.githubusercontent.com/deepseek-ai/deepseek-harness/5badb15009ae1756c3afe0ae0cef1faafc290ccc/LICENSE'); if (!response.ok) throw new Error('无法取得上游许可证。'); await writeFile(path.join(generated, 'DeepSeek-Harness-LICENSE'), await response.text()); });
await import('./generate-notices.mjs');
await cp(path.join(root, 'docs/third-party-notices.md'), path.join(generated, 'THIRD_PARTY_NOTICES.md'));
console.log('平台资源和独立 AI 抠图插件已生成。');
