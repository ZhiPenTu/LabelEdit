import test from 'node:test';import assert from 'node:assert/strict';import {latestReleaseNotes,checkGitHubRelease,releaseDownloadPage} from '../../desktop/updates.mjs';
test('desktop updates display only the target version notes',()=>{assert.equal(latestReleaseNotes({version:'0.3.0',releaseNotes:[{version:'0.3.0',note:'latest'},{version:'0.2.0',note:'history'}]}),'latest');assert.equal(latestReleaseNotes({version:'0.3.0',releaseNotes:[{version:'0.2.0',note:'history'}]}),'');assert.equal(latestReleaseNotes({releaseNotes:'markdown'}),'markdown');assert.equal(latestReleaseNotes({}),'');});

const release={tag_name:'v0.3.0',draft:false,prerelease:false,body:'最新版本变更',html_url:'https://untrusted.example',assets:[{name:'CommerceTools-0.3.0-mac-arm64.dmg',state:'uploaded'},{name:'CommerceTools-0.3.0-win-x64.exe',state:'uploaded'}]};
const options=(value=release)=>({fetchImpl:async()=>new Response(JSON.stringify(value)),platform:'darwin',arch:'arm64'});

test('unsigned updates check the public release, expose only latest notes and use a fixed GitHub download page',async()=>{
 let requested;
 const result=await checkGitHubRelease('0.2.0',{...options(),fetchImpl:async(url,init)=>{requested=url;assert.ok(init.signal);return new Response(JSON.stringify(release));}});
 assert.equal(requested,'https://api.github.com/repos/ZhiPenTu/LabelEdit/releases/latest');
 assert.deepEqual(result,{status:'available',version:'0.3.0',notes:'最新版本变更'});
 assert.equal(releaseDownloadPage(result.version),'https://github.com/ZhiPenTu/LabelEdit/releases/tag/v0.3.0');
 assert.equal((await checkGitHubRelease('0.2.0',{...options(),platform:'win32',arch:'x64'})).status,'available');
 for(const version of ['0.3.0','0.4.0'])assert.deepEqual(await checkGitHubRelease(version,options()),{status:'current',version:null,notes:''});
 for(const version of ['https://untrusted.example','0.3.0/../../other','0.1.4','0.3.0-beta.1'])assert.throws(()=>releaseDownloadPage(version),/版本无效/);
});

test('unsigned updates handle unpublished releases and reject incomplete, prerelease and malformed responses',async()=>{
 assert.deepEqual(await checkGitHubRelease('0.2.0',{...options(),fetchImpl:async()=>new Response('',{status:404})}),{status:'unpublished',version:null,notes:''});
 for(const invalid of [{...release,assets:[]},{...release,prerelease:true},{...release,draft:true},{...release,tag_name:'other-release'},{...release,tag_name:'0.3.0'}])await assert.rejects(checkGitHubRelease('0.2.0',options(invalid)));
 await assert.rejects(checkGitHubRelease('0.2.0',{...options(),fetchImpl:async()=>new Response('',{status:429})}),/HTTP 429/);
 let requests=0;await assert.rejects(checkGitHubRelease('0.2.0',{...options(),fetchImpl:async()=>{requests++;throw new Error('网络失败');}}),/网络失败/);assert.equal(requests,1);
 await assert.rejects(checkGitHubRelease('0.2.0',{...options(),fetchImpl:async()=>new Response('x'.repeat(1024*1024+1))}),/响应过大/);
});
