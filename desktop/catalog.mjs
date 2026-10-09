import semver from 'semver';
export function validateCatalog(value) {
 if(value?.schemaVersion!==1||!Array.isArray(value.plugins)||value.plugins.length>1000)throw new Error('市场目录格式无效。');
 const identities=new Set();
 for(const item of value.plugins){
  if(!/^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)+$/.test(item.id)||item.id.startsWith('system.')||identities.has(item.id)||!semver.valid(item.version)||typeof item.title!=='string'||!item.title.trim()||item.title.length>80||typeof item.description!=='string'||item.description.length>2000||item.releaseNotes!==undefined&&(typeof item.releaseNotes!=='string'||item.releaseNotes.length>64000)||!item.artifacts||typeof item.artifacts!=='object')throw new Error('市场插件条目无效。');
  identities.add(item.id);
  for(const [platform,artifact] of Object.entries(item.artifacts)){
   if(!['darwin-arm64','win32-x64'].includes(platform)||typeof artifact.signature!=='string'||artifact.signature.length>128||!/^[a-f0-9]{64}$/.test(artifact.sha256))throw new Error('市场制品信息无效。');
   const url=new URL(artifact.url);if(url.protocol!=='https:'||url.username||url.password)throw new Error('市场下载地址无效。');
  }
 }
 return value.plugins;
}
