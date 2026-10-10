import {execFileSync} from 'node:child_process';import path from 'node:path';
if(process.platform==='darwin'){
 const app=path.resolve('release/desktop/mac-arm64/Qingzuo.app');
 await import('./verify-macos-runtime.mjs').then(module => module.verifyMacRuntime(app));
 execFileSync('codesign',['--verify','--deep','--strict',app],{stdio:'inherit'});execFileSync('spctl',['--assess','--type','execute',app],{stdio:'inherit'});
 const resources=path.join(app,'Contents/Resources/commerce');
 for(const file of [path.join(resources,'commerce-sandbox')]) execFileSync('codesign',['--verify','--strict',file],{stdio:'inherit'});
}else{
 execFileSync('powershell',['-NoProfile','-NonInteractive','-File',path.resolve('scripts/verify-windows-signatures.ps1'),'-Root',path.resolve('release/desktop')],{stdio:'inherit'});
}
