import {readFile,readdir,writeFile} from 'node:fs/promises';import path from 'node:path';
const lock=JSON.parse(await readFile('package-lock.json')),records=[];
for(const [folder,entry] of Object.entries(lock.packages)){
 if(!folder.startsWith('node_modules/') || entry.dev || entry.link)continue;
 try{
  const pkg=JSON.parse(await readFile(path.join(folder,'package.json'))),licenses=[];
  for(const name of await readdir(folder)) if(/^(licen[sc]e|copying|notice)(\.|$)/i.test(name)){try{licenses.push({filename:name,text:(await readFile(path.join(folder,name),'utf8')).slice(0,100000)});}catch{}}
  records.push({name:pkg.name,version:pkg.version,license:pkg.license??'See upstream package',repository:pkg.repository,licenses});
 }catch{}
}
await writeFile('resources/generated/THIRD_PARTY_NOTICES.json',JSON.stringify(records,null,2));
