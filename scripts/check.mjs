import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {loadBundle} from '../src/bundle.mjs';
import {sha} from '../src/files.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const bundle=await loadBundle(root);
const pkg=JSON.parse(await fs.readFile(path.join(root,'package.json'),'utf8'));
const lock=JSON.parse(await fs.readFile(path.join(root,'package-lock.json'),'utf8'));
if(bundle.version!==pkg.version||lock.name!==pkg.name||lock.version!==pkg.version||lock.packages?.['']?.name!==pkg.name||lock.packages?.['']?.version!==pkg.version)
  throw new Error('Package, lock and skill manifest name/version are not synchronized.');
for(const [rel,bytes] of Object.entries(bundle.files)) {
  if(sha(await fs.readFile(path.join(root,'skills/ask-report-html',rel)))!==sha(bytes))throw new Error('Rebuild skill archive: '+rel);
}
async function walk(dir) {
  for(const entry of await fs.readdir(dir,{withFileTypes:true})) {
    if(['node_modules','.git','.agent-work'].includes(entry.name))continue;
    const file=path.join(dir,entry.name);
    if(entry.isDirectory()){await walk(file);continue;}
    if(entry.name.endsWith('.mjs')||entry.name.endsWith('.js')) {
      const test=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});
      if(test.status!==0)throw new Error(test.stderr);
    }
    if(/\.(md|mjs|js|html|css|json|ya?ml)$/.test(entry.name)) {
      const text=await fs.readFile(file,'utf8');
      if(/[/]Users[/]|[/]home[/]|gh[pousr]_[A-Za-z0-9]{20,}/.test(text))throw new Error('Private data in publishable file: '+file);
    }
  }
}
await walk(root);
console.log('Syntax, archive/source parity and public-content checks passed.');
