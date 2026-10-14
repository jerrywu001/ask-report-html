import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {PassThrough,Writable} from 'node:stream';
import {spawnSync} from 'node:child_process';
import {chooseAgents,parseSelection,chooseMinChangedFiles,chooseConfiguration} from '../src/prompt.mjs';
const agents=[{id:'pi',name:'Pi'},{id:'claude',name:'Claude Code'},{id:'codex',name:'Codex'}];
function terminal(){const input=new PassThrough();input.isTTY=true;input.isRaw=false;input.setRawMode=value=>{input.isRaw=value;};let text='';const output=new Writable({write(chunk,encoding,done){text+=chunk.toString();done();}});output.isTTY=true;return {input,output,text:()=>text};}
test('terminal arrows and space choose agents; Enter is the single installation confirmation',async()=>{
 const tty=terminal();const promise=chooseAgents(agents,tty);tty.input.write('\u001b[B');tty.input.write(' ');tty.input.write('\u001b[B');tty.input.write(' ');tty.input.write('\r');assert.deepEqual(await promise,['claude','codex']);assert.equal(tty.input.isRaw,false);assert.ok(tty.text().includes('Choose your agents'));tty.input.destroy();
});
test('empty Enter waits, language can switch, Escape cancels without a selection',async()=>{
 const tty=terminal();let settled=false;const promise=chooseAgents(agents,tty).then(value=>{settled=true;return value;});tty.input.write('\r');await Promise.resolve();assert.equal(settled,false);assert.ok(tty.text().includes('Select at least one'));tty.input.write('l');assert.ok(tty.text().includes('选择你的 agents'));tty.input.write('\u001b');await new Promise(resolve=>setTimeout(resolve,520));assert.equal(await promise,null);assert.equal(tty.input.isRaw,false);tty.input.destroy();
});
test('plain prompt accepts one line, rejects unknown IDs and never silently selects all',async()=>{
 assert.deepEqual(parseSelection('2,3',agents),['claude','codex']);assert.deepEqual(parseSelection('pi pi',agents),['pi']);assert.throws(()=>parseSelection('pi unknown',agents));
 const input=new PassThrough();let text='';const output=new Writable({write(chunk,encoding,done){text+=chunk;done();}});const result=chooseAgents(agents,{input,output});input.end('2 3\n');assert.deepEqual(await result,['claude','codex']);assert.ok(text.includes('Enter confirms installation'));
});
test('npm configure asks for a numeric threshold, then installs only the returned selection',async t=>{
 const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),parent=path.join(root,'.agent-work/tests');await fs.mkdir(parent,{recursive:true});const home=await fs.mkdtemp(path.join(parent,'Prompt & home-'));t.after(()=>fs.rm(home,{recursive:true,force:true}));
 const p=spawnSync(process.execPath,[path.join(root,'bin/ask-report-html.mjs'),'configure','--home',home],{cwd:root,input:'7\n2,3\n',encoding:'utf8'});assert.equal(p.status,0,p.stderr);assert.ok(p.stdout.includes('Default: 5'));assert.ok(p.stdout.includes('at least 7 actual changed files'));assert.ok(p.stdout.includes('Choose your agents'));assert.ok(p.stdout.includes('Claude Code: installed'));assert.ok(p.stdout.includes('Open a new agent session'));assert.ok(p.stdout.includes('Codex: installed'));await assert.rejects(()=>fs.stat(path.join(home,'.pi')),{code:'ENOENT'});
 const cancelled=spawnSync(process.execPath,[path.join(root,'bin/ask-report-html.mjs'),'configure','--home',home],{cwd:root,input:'\n\n',encoding:'utf8'});assert.equal(cancelled.status,0,cancelled.stderr);assert.ok(cancelled.stdout.includes('No files changed'));
});
test('numeric terminal input accepts a custom integer, keeps the current value on Enter and supports cancellation',async()=>{
 for(const [keys,current,expected] of [['17\r',5,17],['\r',9,9],['q',5,null]]) {
  const tty=terminal();const promise=chooseMinChangedFiles({...tty,current});tty.input.write(keys);assert.equal(await promise,expected);assert.equal(tty.input.isRaw,false);assert.ok(tty.text().includes('Default: 5'));tty.input.destroy();
 }
 const tty=terminal();let settled=false;const promise=chooseMinChangedFiles(tty).then(value=>{settled=true;return value;});tty.input.write('0\r');await Promise.resolve();assert.equal(settled,false);assert.ok(tty.text().includes('positive safe integer'));tty.input.write('\u007f8\r');assert.equal(await promise,8);tty.input.destroy();
});
test('configuration shares one line reader so piped threshold and selection cannot be lost',async()=>{
 for(const [values,expected] of [['\n2\n',{agents:['claude'],minChangedFiles:5}],['0\n2.5\n17\n1,3\n',{agents:['pi','codex'],minChangedFiles:17}],['q\n',null],['7\n\n',null]]){
  const input=new PassThrough();let text='';const output=new Writable({write(chunk,encoding,done){text+=chunk;done();}});
  const promise=chooseConfiguration(agents,{input,output});input.end(values);assert.deepEqual(await promise,expected);assert.ok(text.includes('Default: 5'));
 }
});
test('numeric prompt and agent picker work together in a real-style terminal',async()=>{
 const tty=terminal();const promise=chooseConfiguration(agents,tty);tty.input.write('12\r');await new Promise(resolve=>setImmediate(resolve));tty.input.write('1\r');assert.deepEqual(await promise,{agents:['pi'],minChangedFiles:12});assert.equal(tty.input.isRaw,false);tty.input.destroy();
});
