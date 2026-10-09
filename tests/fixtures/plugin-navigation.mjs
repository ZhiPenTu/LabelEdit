// Run the real application without a CDP/Playwright connection. This separates
// application navigation failures from debugger attachment behavior.
import {app,BrowserWindow,webContents} from 'electron';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {setTimeout as delay} from 'node:timers/promises';
import {manager,workers} from '../../desktop/main.mjs';
const directory=process.argv.find(arg=>arg.startsWith('--navigation-fixtures='))?.slice('--navigation-fixtures='.length);
app.on('will-quit',()=>{if(process.exitCode)app.exit(process.exitCode);});
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
 for(const name of ['navigation-native','navigation-web']) {
  await manager.install(await readFile(path.join(directory,name+'.ecplugin')));
  await invoke('plugins.enable',{id:'local.'+name,enabled:true});
  await invoke('view.open',{id:'local.'+name});
  const view=webContents.getAllWebContents().find(contents=>contents.getURL().startsWith('commerce-plugin://local.'+name+'/'));
  assert.ok(view,'the plugin must commit its own document');
  assert.equal(await view.executeJavaScript('typeof require'),'undefined');
  await view.executeJavaScript("document.querySelector('#run').click()");
  for(;;) {
   const result=await view.executeJavaScript("document.querySelector('#result').textContent");
   if(result) {assert.match(result,/插件服务调用成功|无需重新发布底座/);break;}
   if(Date.now()>deadline)throw new Error('Plugin interaction timed out');
   await delay(50);
  }
  await invoke('view.hide');
 }
 for(const name of ['navigation-native','navigation-web'])await invoke('view.close',{id:'local.'+name});
 assert.equal(workers.workers.size,0,'closing the tools must release local processes');
 console.log('Navigation without debugger: two isolated tool contexts and native service passed.');
} catch(error) {console.error(error);process.exitCode=1;}
finally {app.quit();}
}
void check();
