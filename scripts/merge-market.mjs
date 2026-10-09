import {readFile,writeFile} from 'node:fs/promises';
const entries=new Map();
for(const filename of process.argv.slice(2)){const value=JSON.parse(await readFile(filename));for(const item of value.plugins){const prior=entries.get(item.id);if(prior&&prior.version!==item.version)throw new Error('市场版本不一致。');entries.set(item.id,{...item,artifacts:{...prior?.artifacts,...item.artifacts}});}}
await writeFile('release/commerce-market.json',JSON.stringify({schemaVersion:1,plugins:[...entries.values()]},null,2));
