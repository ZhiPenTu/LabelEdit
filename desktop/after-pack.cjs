const {readdir,stat}=require('node:fs/promises');const path=require('node:path');
module.exports=async context=>{
 if(context.electronPlatformName!=='win32'||!process.env.CSC_LINK)return;
 async function walk(dir){for(const name of await readdir(dir)){const file=path.join(dir,name);if((await stat(file)).isDirectory())await walk(file);else if(/\.(exe|dll|pyd)$/i.test(name)){if(!await context.packager.signIf(file))throw new Error('插件运行资源未完成正式签名。');}}}
 await walk(path.join(context.appOutDir,'resources/commerce'));
};
