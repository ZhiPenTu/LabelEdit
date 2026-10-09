import {execFileSync} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import {createRequire} from 'node:module';
import os from 'node:os';
import path from 'node:path';
const root=process.cwd(),temporary=await mkdtemp(path.join(os.tmpdir(),'commerce-navigation-'));
try {
 for(const [name,native] of [['navigation-native',true],['navigation-web',false]]) {
  execFileSync(process.execPath,[path.join(root,'packages/plugin-sdk/cli.mjs'),'create',name,...(native?['--native']:[])],{cwd:temporary});
  execFileSync(process.execPath,[path.join(root,'packages/plugin-sdk/cli.mjs'),'pack',path.join(temporary,name),path.join(temporary,name+'.ecplugin')]);
 }
 execFileSync(createRequire(import.meta.url)('electron'),[path.join(root,'tests/fixtures/plugin-navigation.mjs'),'--user-data-dir='+path.join(temporary,'data'),'--navigation-fixtures='+temporary],{stdio:'inherit',timeout:45000});
}finally {await rm(temporary,{recursive:true,force:true,maxRetries:5,retryDelay:100});}
