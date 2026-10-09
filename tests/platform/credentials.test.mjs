import test from 'node:test';import assert from 'node:assert/strict';import path from 'node:path';
import {Credentials} from '../../desktop/credentials.mjs';
import {mkdtemp,realpath,rm} from 'node:fs/promises';import os from 'node:os';
import {launchSandbox} from '../../desktop/sandbox.mjs';
test('native OS credential store scopes entries per plugin and clears them',async()=>{
 const store=new Credentials(path.resolve('native/sandbox/target/release/commerce-sandbox'+(process.platform==='win32'?'.exe':''))),id='local.test-'+process.pid;
 try {await store.set(id,'fixture','fixture-not-a-real-key');assert.equal(await store.status(id,'fixture'),true);assert.equal(await store.status('local.other-'+process.pid,'fixture'),false);assert.equal(await store.get(id,'fixture'),'fixture-not-a-real-key');await store.clear(id,'fixture');assert.equal(await store.status(id,'fixture'),false);}finally{await store.clear(id,'fixture');}
});
test('an actual sandboxed process cannot read the host OS credential entry',async()=>{
 const launcher=await realpath(path.resolve('native/sandbox/target/release/commerce-sandbox'+(process.platform==='win32'?'.exe':'')));
 const store=new Credentials(launcher),id='local.sandbox-vault-'+process.pid,value='fixture-vault-boundary-'+process.pid;
 const job=await realpath(await mkdtemp(path.join(os.tmpdir(),'commerce-vault-')));let child;
 try{
  await store.set(id,'fixture',value);
  assert.equal(await store.get(id,'fixture'),value,'host must first prove the fixture exists');
  child=await launchSandbox({executable:launcher,args:['--credential'],readOnly:[path.dirname(launcher)],writable:[job],cwd:job,launcher});
  let output='',errors='',timedOut=false;child.stdout.on('data',data=>output+=data);child.stderr.on('data',data=>errors+=data);
  const exited=new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',(code,signal)=>resolve({code,signal}));});
  const timer=setTimeout(()=>{timedOut=true;child.kill('SIGKILL');},10000);
  child.stdin.end(JSON.stringify({op:'get',account:id+':fixture'}));
  let result;try{result=await exited;await child.cleanup;}finally{clearTimeout(timer);}
  assert.equal(timedOut,false,'a hung process does not prove credential isolation');
  assert.equal(result.signal,null,'the credential probe must complete, not crash');
  assert.equal(output.includes(value),false,'AppContainer/Seatbelt leaked a host credential');
  if(result.code===0)assert.deepEqual(JSON.parse(output),{value:null});
  else {
   assert.equal(result.code,126,'the probe must reach the OS credential API');
   if(process.platform==='darwin')assert.match(errors,/keychain status -(?:50|25291|25308|34018)\b/);
   else assert.match(errors,/os error (?:5|1312)\b/);
  }
  assert.equal(await store.get(id,'fixture'),value,'sandbox must not change the host fixture');
 }finally{await store.clear(id,'fixture');await rm(job,{recursive:true,force:true,maxRetries:5,retryDelay:100});}
});
