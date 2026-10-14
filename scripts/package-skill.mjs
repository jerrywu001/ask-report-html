import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { zipSync } from 'fflate';
import { sha,treeHash } from '../src/files.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const source=path.join(root,'skills/ask-report-html');
const {version,repository}=JSON.parse(await fs.readFile(path.join(root,'package.json'),'utf8'));
await fs.writeFile(path.join(source,'project.json'),JSON.stringify({name:'ask-report-html',version,repository:repository.url.replace(/^git\+/,'').replace(/\.git$/,'')},null,2)+'\n');
const entries={},hashes={};
async function walk(dir,prefix='') {
  for(const entry of (await fs.readdir(dir,{withFileTypes:true})).sort((a,b)=>a.name<b.name?-1:1)) {
    const rel=prefix+entry.name;
    if(entry.isSymbolicLink()) throw new Error('Do not publish links: '+rel);
    if(entry.isDirectory()) await walk(path.join(dir,entry.name),rel+'/');
    else {
      const data=await fs.readFile(path.join(dir,entry.name));
      entries['ask-report-html/'+rel]=[data,{mtime:new Date('2026-01-01T00:00:00Z')}];
      hashes[rel]=sha(data);
    }
  }
}
await walk(source);
const zip=zipSync(entries,{level:9});
await fs.mkdir(path.join(root,'assets'),{recursive:true});
await fs.writeFile(path.join(root,'assets/ask-report-html-skill.zip'),zip);
await fs.writeFile(path.join(root,'assets/skill-manifest.json'),JSON.stringify({version,archiveSha256:sha(zip),treeHash:await treeHash(source),files:hashes},null,2)+'\n');
console.log('Built verified skill archive: '+Object.keys(hashes).length+' files');
