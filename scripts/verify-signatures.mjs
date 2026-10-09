import {execFileSync} from 'node:child_process';import path from 'node:path';import {readdir,lstat} from 'node:fs/promises';
if(process.platform==='darwin'){
 const app=path.resolve('release/desktop/mac-arm64/Commerce Tools.app');
 execFileSync('codesign',['--verify','--deep','--strict',app],{stdio:'inherit'});execFileSync('spctl',['--assess','--type','execute',app],{stdio:'inherit'});
 const resources=path.join(app,'Contents/Resources/commerce');
 for(const file of [path.join(resources,'commerce-sandbox'),path.join(resources,'plugins/official.labeledit/backend/label-edit-backend/label-edit-backend')]) execFileSync('codesign',['--verify','--strict',file],{stdio:'inherit'});
}else{
 const files=[];async function walk(dir){for(const name of await readdir(dir)){const file=path.join(dir,name);if((await lstat(file)).isDirectory())await walk(file);else if(/\.exe$/i.test(name))files.push(file);}}
 await walk('release/desktop');
 for(const file of files)execFileSync('powershell',['-NoProfile','-NonInteractive','-Command','$signature=Get-AuthenticodeSignature -LiteralPath $args[0]; if($signature.Status -ne "Valid"){throw "Executable signature invalid"}',path.resolve(file)],{stdio:'inherit'});
}
