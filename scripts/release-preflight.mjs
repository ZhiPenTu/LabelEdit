import {createPublicKey} from 'node:crypto';import {readFile} from 'node:fs/promises';
const required=process.platform==='darwin'?['CSC_LINK','CSC_KEY_PASSWORD','APPLE_ID','APPLE_APP_SPECIFIC_PASSWORD','APPLE_TEAM_ID']:['CSC_LINK','CSC_KEY_PASSWORD'];
required.push('COMMERCE_PLUGIN_SIGNING_KEY','COMMERCE_PLUGIN_PUBLIC_KEY');
for(const name of required) if(!process.env[name]) throw new Error('正式发布缺少配置：'+name);
if(createPublicKey(process.env.COMMERCE_PLUGIN_SIGNING_KEY).asymmetricKeyType!=='ed25519')throw new Error('插件签名密钥必须为 Ed25519。');
if(createPublicKey(process.env.COMMERCE_PLUGIN_SIGNING_KEY).export({format:'pem',type:'spki'}).trim()!==process.env.COMMERCE_PLUGIN_PUBLIC_KEY.trim()) throw new Error('插件签名公私钥不匹配。');
const pkg=JSON.parse(await readFile('package.json'));if(process.env.GITHUB_REF_NAME!=='v'+pkg.version)throw new Error('发布标签与底座版本不一致。');
console.log('发布配置检查通过。证书有效性仍须由正式签名和系统验证确认。');

const version=pkg.version.split('.').map(Number);if(!Number.isInteger(version[0])||version[0]===0&&version[1]<2)throw new Error('新底座发布版本必须为 v0.2.0 或更高。');
