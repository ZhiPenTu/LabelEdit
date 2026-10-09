const {readdir,stat}=require('node:fs/promises');const path=require('node:path');
module.exports=async context=>{
 if(context.electronPlatformName==='darwin'){require('./mac-signing-scan.cjs').limitMacBinaryScan();return;}
 if(context.electronPlatformName!=='win32'||process.env.COMMERCE_DESKTOP_SIGNING!=='signed')return;
 if(!process.env.CSC_LINK)throw new Error('正式签名模式缺少 Windows 证书。');
 async function walk(dir){for(const name of await readdir(dir)){const file=path.join(dir,name);if((await stat(file)).isDirectory())await walk(file);else if(/\.(exe|dll|pyd|node)$/i.test(name)){if(!await context.packager.signIf(file))throw new Error('插件运行资源未完成正式签名。');}}}
 await walk(path.join(context.appOutDir,'resources/commerce'));
};
