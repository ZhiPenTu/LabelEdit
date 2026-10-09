import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {generateKeyPairSync} from 'node:crypto';
import path from 'node:path';
import os from 'node:os';
import {load} from 'js-yaml';
const script=path.resolve('scripts/release-preflight.mjs');
const keys=generateKeyPairSync('ed25519');
const alternate=generateKeyPairSync('ed25519');
const fixture={
 CSC_LINK:'fixture-certificate-reference',CSC_KEY_PASSWORD:'fixture-password',
 APPLE_ID:'fixture@example.test',APPLE_APP_SPECIFIC_PASSWORD:'fixture-password',APPLE_TEAM_ID:'fixture-team',
 COMMERCE_PLUGIN_SIGNING_KEY:keys.privateKey.export({format:'pem',type:'pkcs8'}),
 COMMERCE_PLUGIN_PUBLIC_KEY:keys.publicKey.export({format:'pem',type:'spki'}),
};
function run(cwd,overrides){
 const env=Object.fromEntries(Object.entries({...fixture,...overrides}).filter(([,value])=>value!==undefined));
 if(process.env.SystemRoot)env.SystemRoot=process.env.SystemRoot;
 return spawnSync(process.execPath,[script],{cwd,env,encoding:'utf8',timeout:10000});
}
async function directory(){const cwd=await mkdtemp(path.join(os.tmpdir(),'commerce-release-'));await writeFile(path.join(cwd,'package.json'),JSON.stringify({version:'0.2.0'}));return cwd;}
const publish={GITHUB_EVENT_NAME:'push',GITHUB_REF_TYPE:'tag',GITHUB_REF_NAME:'v0.2.0'};
const validation={GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_REF_TYPE:'branch',GITHUB_REF_NAME:'main',COMMERCE_VALIDATION_VERSION:'0.2.0'};

test('standalone signing preflight accepts version-matched manual validation and public tag builds',async()=>{
 const cwd=await directory();
 try{
  const manual=run(cwd,validation);assert.equal(manual.status,0,manual.stderr);assert.match(manual.stdout,/仅上传验收制品，不公开发布/);
  const release=run(cwd,publish);assert.equal(release.status,0,release.stderr);assert.match(release.stdout,/发布配置检查通过/);
 }finally{await rm(cwd,{recursive:true,force:true});}
});

test('signing preflight refuses missing credentials, wrong keys, unversioned events and incompatible versions',async()=>{
 const cwd=await directory();
 try{
  const cases=[
   ['missing certificate',{...validation,CSC_LINK:undefined},/缺少配置：CSC_LINK/],
   ['missing plugin key',{...validation,COMMERCE_PLUGIN_SIGNING_KEY:undefined},/缺少配置：COMMERCE_PLUGIN_SIGNING_KEY/],
   ['mismatched plugin key',{...validation,COMMERCE_PLUGIN_PUBLIC_KEY:alternate.publicKey.export({format:'pem',type:'spki'})},/公私钥不匹配/],
   ['wrong tag',{...publish,GITHUB_REF_NAME:'v0.3.0'},/发布标签与底座版本不一致/],
   ['branch push',{...publish,GITHUB_REF_TYPE:'branch',GITHUB_REF_NAME:'main'},/仅支持手动验收/],
   ['manual wrong version',{...validation,COMMERCE_VALIDATION_VERSION:'0.3.0'},/签名验收版本与底座版本不一致/],
   ['manual missing version',{...validation,COMMERCE_VALIDATION_VERSION:undefined},/签名验收版本与底座版本不一致/],
   ['unknown event',{...validation,GITHUB_EVENT_NAME:'pull_request'},/仅支持手动验收/],
  ];
  if(process.platform==='darwin')cases.push(['missing Apple account',{...validation,APPLE_ID:undefined},/缺少配置：APPLE_ID/]);
  for(const [name,env,error] of cases){const result=run(cwd,env);assert.notEqual(result.status,0,name);assert.match(result.stderr,error,name);}
  for(const version of ['0.1.9','0.2.0-rc.1','malformed']){
   await writeFile(path.join(cwd,'package.json'),JSON.stringify({version}));const result=run(cwd,{...validation,COMMERCE_VALIDATION_VERSION:version});assert.notEqual(result.status,0,version);assert.match(result.stderr,/0.2.0 或更高的正式版本号/);
  }
 }finally{await rm(cwd,{recursive:true,force:true});}
});

test('manual signed-build workflow cannot reach the write-enabled public release job',async()=>{
 const workflow=load(await readFile('.github/workflows/release-commerce.yml','utf8'));
 assert.equal(workflow.on.workflow_dispatch.inputs.version.required,true);
 assert.equal(workflow.jobs.signed.env.COMMERCE_VALIDATION_VERSION,'${{ inputs.version }}');
 assert.deepEqual(workflow.permissions,{contents:'read'});
 assert.equal(workflow.jobs.publish.if,"${{ github.event_name == 'push' && startsWith(github.ref, 'refs/tags/v') }}");
 assert.equal(workflow.jobs.publish.needs,'signed');
 assert.deepEqual(workflow.jobs.publish.permissions,{contents:'write'});
});
