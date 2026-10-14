import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {applyDefaults,draftHasTheme} from '../skills/ask-report-html/scripts/render.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const wrapper=path.join(root,'skills/ask-report-html/scripts/render.mjs');
const draft='---\ntitle: Theme test\n---\n## A Diagram\n```flow\nA -> B: next\n```\n## B Note\nTest page.\n';
test('theme defaults are paper, and patch retains the original page theme',()=>{
 assert.deepEqual(applyDefaults(['render','-']),['render','-','--theme','paper','--no-open']);
 assert.deepEqual(applyDefaults(['patch','page.html','--panel','A']),['patch','page.html','--panel','A','--no-open']);
 assert.ok(draftHasTheme('---\r\ntheme: blueprint\r\n---\r\nText'));
 assert.deepEqual(applyDefaults(['render','-','--theme','blueprint','--open']),['render','-','--theme','blueprint','--open']);
});
test('new diagram pages actually render as paper, with explicit and configured alternatives preserved',async t=>{
 const parent=path.join(root,'.agent-work/tests');await fs.mkdir(parent,{recursive:true});const home=await fs.mkdtemp(path.join(parent,'Paper & space-'));t.after(()=>fs.rm(home,{recursive:true,force:true}));
 const configRoot=path.join(home,'.ask-report-html');await fs.mkdir(configRoot);await fs.writeFile(path.join(configRoot,'config.json'),JSON.stringify({theme:'auto',open:true,update_check:false}));
 const env={...process.env,HOME:home,USERPROFILE:home,AM_HOME:configRoot};
 const run=(source,extra=[])=>spawnSync(process.execPath,[wrapper,'render','-','-o',path.join(home,'answer.html'),'--style','strict',...extra],{input:source,encoding:'utf8',env,cwd:root});
 let p=run(draft);assert.equal(p.status,0,p.stderr);assert.ok(p.stdout.includes('sheet · paper'),p.stdout);assert.ok((await fs.stat(path.join(home,'answer.html'))).size>1000);
 p=run(draft,['--theme','blueprint']);assert.equal(p.status,0,p.stderr);assert.ok(p.stdout.includes('sheet · blueprint'),p.stdout);
 p=run(draft.replace('title: Theme test','title: Theme test\ntheme: blueprint'));assert.equal(p.status,0,p.stderr);assert.ok(p.stdout.includes('sheet · blueprint'),p.stdout);
 await fs.writeFile(path.join(configRoot,'config.json'),JSON.stringify({theme:'shadcn',open:true,update_check:false}));
 p=run(draft);assert.equal(p.status,0,p.stderr);assert.ok(p.stdout.includes('sheet · shadcn'),p.stdout);
 assert.equal(JSON.parse(await fs.readFile(path.join(configRoot,'config.json'),'utf8')).theme,'shadcn');
});
