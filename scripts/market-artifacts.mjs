import {readFile,writeFile,mkdir} from 'node:fs/promises';import path from 'node:path';import {sign,createHash} from 'node:crypto';import {pack} from '../packages/plugin-sdk/cli.mjs';
const platform=process.platform+'-'+process.arch,key=process.env.COMMERCE_PLUGIN_SIGNING_KEY;
if(!key)throw new Error('缺少插件市场签名密钥。');
const {version:base}=JSON.parse(await readFile('package.json')),entries=[];
await mkdir('release/market',{recursive:true});
const packaged=process.platform==='darwin'?'release/desktop/mac-arm64/Commerce Tools.app/Contents/Resources/commerce/plugins/official.labeledit':'release/desktop/win-unpacked/resources/commerce/plugins/official.labeledit';
for(const folder of [packaged,'plugins/removebg']){
 const pkg=JSON.parse(await readFile(path.join(folder,'package.json'))),m=pkg.commerce,name=`${m.id}-${pkg.version}-${platform}.ecplugin`,filename=path.join('release/market',name);
 await pack(path.resolve(folder),path.resolve(filename));const bytes=await readFile(filename);
 entries.push({id:m.id,title:m.title,description:m.description,category:m.category,version:pkg.version,releaseNotes:m.releaseNotes,artifacts:{[platform]:{url:`https://github.com/ZhiPenTu/LabelEdit/releases/download/v${base}/${name}`,sha256:createHash('sha256').update(bytes).digest('hex'),signature:sign(null,bytes,key).toString('base64')}}});
}
await writeFile(`release/market/catalog-${platform}.json`,JSON.stringify({schemaVersion:1,plugins:entries},null,2));
