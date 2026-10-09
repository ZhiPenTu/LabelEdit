import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm,access} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import os from 'node:os';import path from 'node:path';
import {Workers} from '../../desktop/workers.mjs';
import {pack} from '../../packages/plugin-sdk/cli.mjs';
import {unpackPackage} from '../../desktop/plugin-manager.mjs';
const folder=path.resolve('resources/generated/plugins/official.labeledit');
test('packaged offline LabelEdit runs PDF → real OCR → edit → preview → export through OS-sandboxed RPC', {timeout:90000}, async () => {
  const jobs=await mkdtemp(path.join(os.tmpdir(),'commerce-rpc-'));const workers=new Workers(jobs,path.resolve('resources/generated/commerce-sandbox'+(process.platform==='win32'?'.exe':'')),process.execPath);
  const original=await readFile('文具新大 70X40.pdf');
  try {
    // Exercise the independently distributed artifact, rather than only its
    // build directory: package format, native modes and bundled dependencies
    // must survive the same extraction used for installation and updates.
    const artifact=path.join(jobs,'labeledit.ecplugin'),installed=path.join(jobs,'installed');
    await pack(folder,artifact);
    const manifest=await unpackPackage(await readFile(artifact),installed);
    const plugin={...manifest,folder:installed,enabled:true,missing:[]};
    const worker=await workers.start(plugin);assert.equal((await worker.call('health')).ocr.ready,true);
    const doc=await worker.call('upload',{data:original.toString('base64'),filename:'sample.pdf'});assert.equal(doc.pages[0].width_mm,70);
    const recognition=await worker.call('recognize',{id:doc.id,page:0,language:'latin'});assert.match(recognition.engine,/RapidOCR/);
    const region=recognition.regions.find(r=>r.text.includes('SG250128'));assert.ok(region);
    const edit={...region,text:region.text.replace('SG250128','SG261009'),bold:true};delete edit.source;delete edit.confidence;
    const preview=await worker.call('preview',{id:doc.id,page:0,edits:[edit]});assert.equal(preview.mime,'image/png');assert.equal(Buffer.from(preview.data,'base64').subarray(1,4).toString(),'PNG');
    const exported=await worker.call('export',{id:doc.id,edits:[edit]});assert.equal(exported.mime,'application/pdf');
    let python=process.env.COMMERCE_TEST_PYTHON || 'python';try {await access('.venv/bin/python');python=path.resolve('.venv/bin/python');}catch{}
    const result=spawnSync(python,['-c',"import sys,base64,json;from io import BytesIO;from pypdf import PdfReader;p=PdfReader(BytesIO(base64.b64decode(sys.stdin.read()))).pages[0];print(json.dumps({'text':p.extract_text(),'width':float(p.mediabox.width),'height':float(p.mediabox.height)}))"],{input:exported.data,encoding:'utf8'});assert.equal(result.status,0,result.stderr);
    const pdf=JSON.parse(result.stdout);assert.match(pdf.text,/SG261009/);assert.ok(Math.abs(pdf.width-doc.pages[0].width_pt)<0.01);assert.ok(Math.abs(pdf.height-doc.pages[0].height_pt)<0.01);
    assert.deepEqual(await readFile('文具新大 70X40.pdf'),original);await worker.call('close',{id:doc.id});await assert.rejects(worker.call('image',{id:doc.id,page:0}));
    // Caller-specific workers never expose the open document store to another tool.
    const another=await workers.start(plugin,'local.other');assert.notEqual(another,worker);
    await assert.rejects(another.call('image',{id:doc.id,page:0}));
    await workers.stopAll();assert.equal(workers.workers.size,0);assert.equal(worker.closed,true);
  }finally{await workers.stopAll();await rm(jobs,{recursive:true,force:true});}
});
