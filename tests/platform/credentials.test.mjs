import test from 'node:test';import assert from 'node:assert/strict';import path from 'node:path';
import {Credentials} from '../../desktop/credentials.mjs';
test('native OS credential store scopes entries per plugin and clears them',async()=>{
 const store=new Credentials(path.resolve('native/sandbox/target/release/commerce-sandbox'+(process.platform==='win32'?'.exe':''))),id='local.test-'+process.pid;
 try {await store.set(id,'fixture','fixture-not-a-real-key');assert.equal(await store.status(id,'fixture'),true);assert.equal(await store.status('local.other-'+process.pid,'fixture'),false);assert.equal(await store.get(id,'fixture'),'fixture-not-a-real-key');await store.clear(id,'fixture');assert.equal(await store.status(id,'fixture'),false);}finally{await store.clear(id,'fixture');}
});
