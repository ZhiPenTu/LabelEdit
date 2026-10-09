import {readFile} from 'node:fs/promises';
const value=JSON.parse(await readFile(process.argv[2]));
if(value.version!=='0.1.5' || !value.platforms || Object.values(value.platforms).some(p=>!p.url?.startsWith('https://github.com/ZhiPenTu/LabelEdit/releases/download/v0.1.5/') || !p.signature))throw new Error('旧更新清单必须继续指向签名的兼容旧版 v0.1.5。');
console.log('旧更新渠道保持在 v0.1.5。');
