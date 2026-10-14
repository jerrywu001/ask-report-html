import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {PassThrough,Writable} from 'node:stream';
import {chooseLegacyRemoval,chooseConfiguration} from '../src/prompt.mjs';
import {startServer} from '../src/server.mjs';
import {Installer} from '../src/installer.mjs';
import {catalog} from '../src/catalog.mjs';
import {loadBundle} from '../src/bundle.mjs';
import {pathSnapshot} from '../src/files.mjs';
import {inspectLegacy,removeLegacyEntry} from '../src/legacy.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),bundle=await loadBundle(root);
async function fixture(t,options={}) {
 const parent=path.join(root,'.agent-work/tests');await fs.mkdir(parent,{recursive:true});
 const home=await fs.mkdtemp(path.join(parent,'Legacy & home-'));t.after(()=>fs.rm(home,{recursive:true,force:true}));
 return {home,installer:new Installer({home,env:{},bundle,...options}),old:path.join(home,'.agents/skills/answer-me-with-html')};
}
async function seed(file){await fs.mkdir(file,{recursive:true});await fs.writeFile(path.join(file,'SKILL.md'),'Original skill content');}
const missing=file=>assert.rejects(()=>fs.lstat(file),{code:'ENOENT'});
test('detection checks fixed global entries, honors custom roots, never walks projects',async t=>{
 const {home,installer,old}=await fixture(t);assert.deepEqual(await installer.legacy(),[]);assert.deepEqual(await fs.readdir(home),[]);
 await seed(old);await seed(path.join(home,'project/.agents/skills/answer-me-with-html'));await seed(path.join(home,'other-claude/skills/answer-me-with-html'));
 const custom=new Installer({home,env:{CLAUDE_CONFIG_DIR:'other-claude'},bundle});const rows=await custom.legacy();assert.equal(rows.length,2);assert.ok(rows.every(row=>row.removable));assert.ok(!rows.some(row=>row.path.includes('project')));
 assert.equal(new Set((await catalog({home,env:{PI_CODING_AGENT_DIR:'.claude'}})).legacyPaths).size,(await catalog({home,env:{PI_CODING_AGENT_DIR:'.claude'}})).legacyPaths.length);
});
test('default keep and explicit N never modify old entries or their rules',async t=>{
 const {home,installer,old}=await fixture(t);await seed(old);const before=await pathSnapshot(old),rule=path.join(home,'.pi/agent/AGENTS.md');await fs.mkdir(path.dirname(rule),{recursive:true});await fs.writeFile(rule,'# Old preference\n[answer-me-with-html task-report]\nKeep old policy.\n');
 const preview=await installer.preview(['pi']);assert.equal(preview.removeLegacy,false);assert.equal(preview.legacy.length,1);assert.deepEqual(await pathSnapshot(old),before);await missing(path.join(home,'.ask-report-html'));
 const result=await installer.install(preview.planId);assert.equal(result.status,'completed');assert.equal(result.legacy[0].status,'kept');assert.deepEqual(await pathSnapshot(old),before);assert.ok((await fs.readFile(rule,'utf8')).startsWith('# Old preference\n[answer-me-with-html task-report]\nKeep old policy.\n'));
});
test('confirmed removal backs up directories, only after a successful replacement',async t=>{
 const {home,installer,old}=await fixture(t);await seed(old);const reports=path.join(home,'.answer-me-with-html/history.html');await fs.mkdir(path.dirname(reports),{recursive:true});await fs.writeFile(reports,'Historical report');
 const plan=await installer.preview(['pi'],undefined,true);assert.equal(plan.removeLegacy,true);assert.ok((await fs.lstat(old)).isDirectory());await missing(path.join(home,'.ask-report-html'));
 const result=await installer.install(plan.planId);assert.equal(result.status,'completed');assert.equal(result.legacy[0].status,'removed');await missing(old);
 assert.equal(await fs.readFile(path.join(result.legacy[0].backup,'SKILL.md'),'utf8'),'Original skill content');assert.equal(await fs.readFile(path.join(result.legacy[0].original,'SKILL.md'),'utf8'),'Original skill content');assert.equal(await fs.readFile(reports,'utf8'),'Historical report');assert.deepEqual(await installer.legacy(),[]);
});
test('old entries changing or appearing after cleanup preview invalidate install before writes',async t=>{
 const {home,installer,old}=await fixture(t);await seed(old);const plan=await installer.preview(['pi'],undefined,true);await fs.writeFile(path.join(old,'SKILL.md'),'External change');await assert.rejects(()=>installer.install(plan.planId),/变化/);await missing(path.join(home,'.agents/skills/ask-report-html'));assert.equal(await fs.readFile(path.join(old,'SKILL.md'),'utf8'),'External change');
 const next=await installer.preview(['pi'],undefined,true);await seed(path.join(home,'.claude/skills/answer-me-with-html'));await assert.rejects(()=>installer.install(next.planId),/变化/);await missing(path.join(home,'.ask-report-html'));
});
test('cleanup approval must be boolean and cannot be added to an already confirmed keep plan',async t=>{
 const {installer,old}=await fixture(t);await seed(old);for(const value of ['yes',1,null,{}])await assert.rejects(()=>installer.preview(['pi'],undefined,value));
 const plan=await installer.preview(['pi'],undefined,false);const result=await installer.install(plan.planId,true);assert.equal(result.legacy[0].status,'kept');assert.ok((await fs.lstat(old)).isDirectory());
});
test('partial new installation retains the old working skill even when removal was requested',async t=>{
 const {installer,old}=await fixture(t,{platform:'linux',linkOptions:{symlink:async()=>{throw Object.assign(new Error('fixture permissions'),{code:'EPERM'});}}});await seed(old);
 const result=await installer.install((await installer.preview(['claude'],undefined,true)).planId);assert.equal(result.status,'partial');assert.equal(result.legacy[0].status,'kept');assert.equal(result.legacy[0].reason,'installation-incomplete');assert.ok((await fs.lstat(old)).isDirectory());
});
test('cross-device removal failure reports an error and preserves the original',async t=>{
 const {home,old}=await fixture(t);await seed(old);const row=await inspectLegacy(old);await assert.rejects(()=>removeLegacyEntry(row,path.join(home,'backups'),{rename:async()=>{throw Object.assign(new Error('EXDEV fixture'),{code:'EXDEV'});}}),/EXDEV/);assert.equal(await fs.readFile(path.join(old,'SKILL.md'),'utf8'),'Original skill content');
});
test('symlink cleanup unlinks only the listed entry and preserves external targets',{skip:process.platform==='win32'},async t=>{
 const {home,installer,old}=await fixture(t);const external=path.join(home,'external-skill');await seed(external);await fs.mkdir(path.dirname(old),{recursive:true});await fs.symlink(external,old);
 const broken=path.join(home,'.claude/skills/answer-me-with-html');await fs.mkdir(path.dirname(broken),{recursive:true});await fs.symlink(path.join(home,'missing-external'),broken);
 const result=await installer.install((await installer.preview(['pi'],undefined,true)).planId);assert.equal(result.status,'completed');assert.equal(result.legacy.length,2);await missing(old);await missing(broken);assert.equal(await fs.readFile(path.join(external,'SKILL.md'),'utf8'),'Original skill content');
 const descriptor=JSON.parse(await fs.readFile(result.legacy.find(e=>e.path===old).backup,'utf8'));assert.equal(descriptor.target,external);
});
test('a linked parent is reported for manual handling and never followed for deletion',{skip:process.platform==='win32'},async t=>{
 const {home}=await fixture(t);const external=path.join(home,'external-root'),alias=path.join(home,'claude-alias');await seed(path.join(external,'skills/answer-me-with-html'));await fs.symlink(external,alias);
 const installer=new Installer({home,env:{CLAUDE_CONFIG_DIR:alias},bundle});const plan=await installer.preview(['pi'],undefined,true);assert.equal(plan.legacy[0].removable,false);
 const result=await installer.install(plan.planId);assert.equal(result.status,'partial');assert.equal(result.legacy[0].status,'manual-required');assert.equal(await fs.readFile(path.join(external,'skills/answer-me-with-html/SKILL.md'),'utf8'),'Original skill content');
});
test('CLI dry-run explains the recommendation, and --yes alone does not authorize deletion',async t=>{
 const {home,old}=await fixture(t);await seed(old);const entry=path.join(root,'bin/ask-report-html.mjs');const run=extra=>spawnSync(process.execPath,[entry,'configure','--home',home,'--agents','pi',...extra],{cwd:root,encoding:'utf8'});
 const dry=run(['--remove-legacy','--dry-run']);assert.equal(dry.status,0,dry.stderr);assert.ok(dry.stdout.includes('removal recommended'));assert.ok(dry.stdout.includes('duplicate reports'));assert.ok(dry.stdout.includes(old));await missing(path.join(home,'.ask-report-html'));
 const keep=run(['--yes','--json']);assert.equal(keep.status,0,keep.stderr);assert.equal(JSON.parse(keep.stdout).legacy[0].status,'kept');assert.ok((await fs.lstat(old)).isDirectory());
 const remove=run(['--remove-legacy','--yes','--json']);assert.equal(remove.status,0,remove.stderr);assert.equal(JSON.parse(remove.stdout).legacy[0].status,'removed');await missing(old);
});
test('CLI interactive Y removes, N/default keep, and cancellation after Y never writes',async t=>{
 const entry=path.join(root,'bin/ask-report-html.mjs');
 for(const [answer,selection,expected] of [['y','1',true],['N','1',false],['','1',false],['y','',false]]){
  const {home,old}=await fixture(t);await seed(old);const p=spawnSync(process.execPath,[entry,'configure','--home',home],{cwd:root,input:`5\n${answer}\n${selection}\n`,encoding:'utf8'});assert.equal(p.status,0,p.stderr);assert.ok(p.stdout.includes('Y = remove'));assert.ok(p.stdout.includes('N = keep (default)'));
  if(expected)await missing(old);else assert.ok((await fs.lstat(old)).isDirectory());if(!selection)await missing(path.join(home,'.ask-report-html'));
 }
});
function terminal(){const input=new PassThrough();input.isTTY=true;input.isRaw=false;input.setRawMode=value=>{input.isRaw=value;};let text='';const output=new Writable({write(chunk,encoding,done){text+=chunk;done();}});output.isTTY=true;return {input,output,text:()=>text};}
test('TTY legacy question accepts Y/N, defaults to keep, switches language and restores raw mode',async()=>{
 const rows=[{path:'example/answer-me-with-html',removable:true}];
 for(const [keys,expected] of [['Y',true],['n',false],['\r',false],['q',null]]){
  const tty=terminal();const promise=chooseLegacyRemoval(rows,tty);tty.input.write(keys);assert.equal(await promise,expected);assert.equal(tty.input.isRaw,false);assert.ok(tty.text().includes('duplicate reports'));tty.input.destroy();
 }
 const tty=terminal();const promise=chooseLegacyRemoval(rows,tty);tty.input.write('l');assert.ok(tty.text().includes('建议删除'));tty.input.write('x');assert.ok(tty.text().includes('请输入 Y'));tty.input.write('n');assert.equal(await promise,false);tty.input.destroy();
});
test('threshold, legacy choice and agent selection share one reader without dropping piped answers',async()=>{
 const input=new PassThrough(),output=new Writable({write(c,e,done){done();}});const promise=chooseConfiguration([{id:'pi',name:'Pi'}],{input,output,legacy:[{path:'example/answer-me-with-html',removable:true}]});input.end('7\nyes\n1\n');assert.deepEqual(await promise,{agents:['pi'],minChangedFiles:7,removeLegacy:true});
});
test('HTTP cleanup is read-only until confirmation, bound to the plan, and never accepts arbitrary paths',async t=>{
 const {home,old}=await fixture(t);await seed(old);const app=await startServer({root,home,env:{},port:0});t.after(()=>app.close());const html=await (await fetch(app.origin)).text(),token=html.match(/name="ask-report-html-token" content="([a-f0-9]+)"/)[1];const headers={'x-ask-report-html-token':token,'Content-Type':'application/json'};
 const post=(route,data)=>fetch(app.origin+'/api/'+route,{method:'POST',headers,body:JSON.stringify(data)});
 const current=await (await fetch(app.origin+'/api/state',{headers})).json();assert.equal(current.legacy.length,1);assert.equal((await post('plan',{agents:['pi'],removeLegacy:'yes'})).status,400);
 const plan=await (await post('plan',{agents:['pi'],removeLegacy:false})).json();assert.equal(plan.legacy.length,1);await missing(path.join(home,'.ask-report-html'));
 const keep=await (await post('install',{planId:plan.planId,removeLegacy:true})).json();assert.equal(keep.legacy[0].status,'kept');assert.ok((await fs.lstat(old)).isDirectory());
 const safe=path.join(home,'unrelated.txt');await fs.writeFile(safe,'Keep this');const next=await (await post('plan',{agents:['pi'],removeLegacy:true,legacyPaths:[safe]})).json();
 const removed=await (await post('install',{planId:next.planId})).json();assert.equal(removed.legacy[0].status,'removed');await missing(old);assert.equal(await fs.readFile(safe,'utf8'),'Keep this');
});
