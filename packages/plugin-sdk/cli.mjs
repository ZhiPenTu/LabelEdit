#!/usr/bin/env node
import { mkdir, readFile, writeFile, readdir, lstat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createHash, sign } from 'node:crypto';
import AdmZip from 'adm-zip';
import { validateManifest } from './manifest.mjs';
export async function pack(directory, output) {
  const pkg = JSON.parse(await readFile(path.join(directory, 'package.json'), 'utf8')); validateManifest(pkg);
  const zip = new AdmZip();
  async function walk(folder, prefix = '') { for (const name of await readdir(folder)) {
    if ((['.git', '.DS_Store', 'node_modules'].includes(name) || name.startsWith('.env'))) continue;
    const filename = path.join(folder, name), relative = prefix + name, info = await lstat(filename);
    if (info.isSymbolicLink()) throw new Error('插件包不能包含符号链接。');
    if (info.isDirectory()) await walk(filename, relative + '/');
    else if (info.isFile()) zip.addFile(relative, await readFile(filename), '', info.mode);
    else throw new Error('不支持的文件类型。');
  } }
  await walk(directory); const bytes = zip.toBuffer(); await mkdir(path.dirname(output), { recursive: true }); await writeFile(output, bytes); return { id: pkg.commerce.id, version: pkg.version, sha256: createHash('sha256').update(bytes).digest('hex') };
}
async function create(name, native) {
  if (!/^[a-z][a-z0-9-]{1,40}$/.test(name)) throw new Error('名称必须为小写字母、数字和连字符。');
  const dir = path.resolve(name); await mkdir(dir); await mkdir(path.join(dir, 'ui'));
  const pkg = { name: '@local/' + name, version: '0.1.0', type: 'module', commerce: { manifestVersion: 1, id: 'local.' + name, title: name, description: '我的电商工具', api: '^1.0.0', ui: 'ui/index.html', permissions: { files: true } } };
  if (native) { pkg.commerce.backend = { type: 'node', entry: { 'darwin-arm64': 'worker.mjs', 'win32-x64': 'worker.mjs' } }; pkg.commerce.services = { provides: ['local.' + name] }; }
  await writeFile(path.join(dir, 'package.json'), JSON.stringify(pkg, null, 2));
  await writeFile(path.join(dir, 'ui/sdk.mjs'), await readFile(new URL('./index.mjs', import.meta.url)));
  await writeFile(path.join(dir, 'ui/index.html'), '<!doctype html><html lang="zh"><meta charset="UTF-8"><title>' + name + '</title><h1>' + name + '</h1><p>我的电商工具</p><button id="run">运行示例</button><p id="result" role="status"></p><script type="module" src="app.mjs"></script></html>');
  await writeFile(path.join(dir, 'ui/app.mjs'), "import {createPluginClient} from './sdk.mjs';\nconst client=createPluginClient();\ndocument.querySelector('#run').onclick=async()=>{try{document.querySelector('#result').textContent=" + (native ? "await client.services.call('local." + name + "','echo',{text:'插件服务调用成功'})" : "'网页插件已运行，无需重新发布底座'" ) + ";}catch(e){document.querySelector('#result').textContent=e.message;}};\n");
  if (native) await writeFile(path.join(dir, 'worker.mjs'), "import {createInterface} from 'node:readline';\nfor await (const line of createInterface({input:process.stdin})){const r=JSON.parse(line);const result=r.method==='health'?{ready:true}:r.method==='echo'?String(r.args.text):null;process.stdout.write(JSON.stringify({id:r.id,result})+'\\n');}\n");
  await writeFile(path.join(dir, 'README.md'), '使用 npm run plugin -- pack ' + name + ' ' + name + '.ecplugin 打包，然后在工具中心导入。依赖须预先构建进 ui 或 worker；生产安装不执行脚本。\n');
}
export async function main(args) {
  const [command, first, second] = args;
  if (command === 'create') await create(first, args.includes('--native'));
  else if (command === 'validate') { validateManifest(JSON.parse(await readFile(path.join(first, 'package.json'), 'utf8'))); console.log('插件清单有效。'); }
  else if (command === 'pack') console.log(JSON.stringify(await pack(path.resolve(first), path.resolve(second || first + '.ecplugin'))));
  else if (command === 'sign') { const key = process.env.COMMERCE_PLUGIN_SIGNING_KEY; if (!key) throw new Error('未配置 COMMERCE_PLUGIN_SIGNING_KEY。'); const bytes = await readFile(first); await writeFile(first + '.signature.json', JSON.stringify({ sha256: createHash('sha256').update(bytes).digest('hex'), signature: sign(null, bytes, key).toString('base64') })); }
  else throw new Error('用法：create <name> [--native] | validate <directory> | pack <directory> [output.ecplugin] | sign <artifact>');
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2)).catch(error => { console.error(error.message); process.exitCode = 1; });
