// Run the real application without a CDP/Playwright connection. This separates
// application navigation failures from debugger attachment behavior.
import {app,BrowserWindow,webContents} from 'electron';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {setTimeout as delay} from 'node:timers/promises';
import {execFileSync} from 'node:child_process';
import {manager,workers} from '../../desktop/main.mjs';
import {assertRendererNetworkBlocked} from './renderer-network-probe.mjs';
const directory=process.argv.find(arg=>arg.startsWith('--navigation-fixtures='))?.slice('--navigation-fixtures='.length);
app.on('will-quit',()=>{if(process.exitCode)app.exit(process.exitCode);});
app.on('child-process-gone',(_event,details)=>console.error('Child process gone:',details));
const names=['navigation-web-one','navigation-web-two','navigation-native','navigation-web-three'];
let originalAccess;
function runtimeAccess(stage) {
 if(process.platform!=='win32')return;
 const access=execFileSync('icacls',[process.execPath],{encoding:'utf8'});
 if(originalAccess===undefined)originalAccess=access;
 assert.equal(access,originalAccess,'local plugins must not change the desktop executable ACL: '+stage);
}
async function check() {
const deadline=Date.now()+30000;
try {
 let shell;
 for (;;) {
  shell=BrowserWindow.getAllWindows()[0]?.webContents;
  if(shell?.getURL()) {
   try {if((await shell.executeJavaScript("window.commerceDesktop.invoke('status')")).kernel.ready)break;}catch{}
  }
  if(Date.now()>deadline)throw new Error('Application startup timed out');
  await delay(50);
 }
 const invoke=(method,args={})=>shell.executeJavaScript('window.commerceDesktop.invoke('+JSON.stringify(method)+','+JSON.stringify(args)+')');
 runtimeAccess('before tools');
 for(const name of names) {
  await manager.install(await readFile(path.join(directory,name+'.ecplugin')));
  runtimeAccess('installed '+name);
  await invoke('plugins.enable',{id:'local.'+name,enabled:true});
  await Promise.all([invoke('view.open',{id:'local.'+name}),invoke('view.open',{id:'local.'+name})]);
  const contexts=webContents.getAllWebContents().filter(contents=>contents.getURL().startsWith('commerce-plugin://local.'+name+'/'));
  assert.equal(contexts.length,1,'concurrent opens must share one tool context');
  const view=contexts[0];
  assert.ok(view,'the plugin must commit its own document');
  assert.equal(await view.executeJavaScript('typeof require'),'undefined');
  if(name === 'navigation-native') await assertRendererNetworkBlocked((fn,args)=>view.executeJavaScript('('+fn.toString()+')('+JSON.stringify(args)+')'));
  await view.executeJavaScript("document.querySelector('#run').click()");
  for(;;) {
   const result=await view.executeJavaScript("document.querySelector('#result').textContent");
   if(result) {assert.match(result,/插件服务调用成功|无需重新发布底座/);break;}
   if(Date.now()>deadline)throw new Error('Plugin interaction timed out');
   await delay(50);
  }
  await invoke('view.hide');
  runtimeAccess('after interaction '+name);
 }
 for(const name of names)await invoke('view.close',{id:'local.'+name});
 assert.equal(workers.workers.size,0,'closing the tools must release local processes');
 console.log('Navigation without debugger: multiple isolated tool contexts and native service passed.');
} catch(error) {console.error(error);process.exitCode=1;}
finally {app.quit();}
}
void check();
