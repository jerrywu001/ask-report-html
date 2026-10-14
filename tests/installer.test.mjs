import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {Installer} from '../src/installer.mjs';
import {loadBundle} from '../src/bundle.mjs';
import {catalog} from '../src/catalog.mjs';
import {appendRule,START,END,treeHash,linkState,createDirectoryLink,MARKER,pathSnapshot,replaceSkillEntry} from '../src/files.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const bundle=await loadBundle(root);
async function fixture(t) {
  const parent=path.join(root,'.agent-work/tests');
  await fs.mkdir(parent,{recursive:true});
  const home=await fs.mkdtemp(path.join(parent,'Home & 空格-'));
  t.after(()=>fs.rm(home,{recursive:true,force:true}));
  return {home,installer:new Installer({home,bundle})};
}
test('catalog: eight agents and only the required dedicated links',async t=>{
  const {home}=await fixture(t);const c=await catalog({home,env:{}});
  assert.equal(c.agents.length,8);
  assert.deepEqual(c.agents.filter(a=>a.links.length).map(a=>a.id),['claude','antigravity']);
  assert.equal(c.agents.find(a=>a.id==='cursor').rulesPath,null);
  assert.equal(c.agents.find(a=>a.id==='cursor').manualRules,true);
});
test('catalog respects configured roots and existing override files',async t=>{
  const {home}=await fixture(t);
  const override=path.join(home,'custom-pi','AGENTS.override.md');
  await fs.mkdir(path.dirname(override));await fs.writeFile(override,'existing');
  const c=await catalog({home,env:{PI_CODING_AGENT_DIR:'custom-pi',CODEX_HOME:'custom-codex',KIMI_CODE_HOME:'custom-kimi',GROK_HOME:'custom-grok',OPENCODE_DISABLE_EXTERNAL_SKILLS:'true'}});
  assert.equal(c.agents.find(a=>a.id==='pi').rulesPath,override);
  assert.equal(c.agents.find(a=>a.id==='codex').rulesPath,path.join(home,'custom-codex/AGENTS.md'));
  assert.equal(c.agents.find(a=>a.id==='kimi').rulesPath,path.join(home,'custom-kimi/AGENTS.md'));
  assert.equal(c.agents.find(a=>a.id==='grok').rulesPath,path.join(home,'custom-grok/AGENTS.md'));
  assert.equal(c.agents.find(a=>a.id==='opencode').links.length,1);
});
test('append preserves surrounding text, CRLF and idempotence',()=>{
  const old='existing\r\n';const next=appendRule(old,'rule\nline');
  assert.ok(next.startsWith(old));assert.ok(next.includes('rule\r\nline'));assert.equal(appendRule(next,'rule\nline'),next);
  const text='before\n'+START+'\nold\n'+END+'\nafter\n';
  assert.equal(appendRule(text,'new'),'before\n'+START+'\nnew\n'+END+'\nafter\n');
});
test('malformed and duplicate markers are refused',()=>{
  for(const text of [START,END,END+'\n'+START,START+END+START+END])assert.throws(()=>appendRule(text,'rule'),/标记/);
});
test('preview is read-only and validates agent IDs',async t=>{
  const {home,installer}=await fixture(t);
  const plan=await installer.preview(['pi','claude']);
  assert.equal(plan.canInstall,true);assert.deepEqual(await fs.readdir(home),[]);
  for(const ids of [[],['unknown'],['pi','pi'],null,['__proto__']])await assert.rejects(()=>installer.preview(ids));
});
test('install all: seven global files, Cursor manual, archive extraction and links',async t=>{
  const {home,installer}=await fixture(t);
  const rules=path.join(home,'.pi/agent/AGENTS.md');
  await fs.mkdir(path.dirname(rules),{recursive:true});await fs.writeFile(rules,'# Existing preference\n');
  const ids=['pi','claude','codex','opencode','grok','antigravity','kimi','cursor'];
  const result=await installer.install((await installer.preview(ids)).planId);
  assert.equal(result.status,'completed');
  assert.equal(result.results.filter(r=>r.status==='installed').length,7);
  assert.equal(result.results.find(r=>r.id==='cursor').status,'manual-required');
  assert.equal(await treeHash(result.canonicalPath),bundle.treeHash);
  assert.ok((await fs.readFile(rules,'utf8')).startsWith('# Existing preference\n'));
  assert.equal(await fs.readFile(result.results.find(r=>r.id==='pi').backup,'utf8'),'# Existing preference\n');
  for(const id of ['claude','antigravity']){
    const row=result.results.find(r=>r.id===id);
    assert.ok(['symlink','junction','managed-copy'].includes(row.links[0].kind));
    assert.ok((await linkState(row.links[0].path,result.canonicalPath,bundle.treeHash)).kind);
  }
  const again=await installer.install((await installer.preview(ids)).planId);
  assert.ok(again.results.filter(r=>r.id!=='cursor').every(r=>r.ruleAction==='unchanged' && !r.backup));
  assert.equal((await fs.readFile(rules,'utf8')).split(START).length-1,1);
  await assert.rejects(()=>fs.stat(path.join(home,'.cursor/AGENTS.md')),{code:'ENOENT'});
});
test('selected agents only; invalid/replayed plans do not write',async t=>{
  const {home,installer}=await fixture(t);const plan=await installer.preview(['codex']);
  await installer.install(plan.planId);
  await assert.rejects(()=>fs.stat(path.join(home,'.claude/CLAUDE.md')),{code:'ENOENT'});
  await assert.rejects(()=>installer.install(plan.planId),/过期/);
  await assert.rejects(()=>installer.install('bad'),/过期/);
});
test('external edits after preview invalidate the install before extraction',async t=>{
  const {home,installer}=await fixture(t);const file=path.join(home,'.codex/AGENTS.md');
  await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,'before');
  const plan=await installer.preview(['codex']);await fs.writeFile(file,'external edit');
  await assert.rejects(()=>installer.install(plan.planId),/变化/);
  assert.equal(await fs.readFile(file,'utf8'),'external edit');
  await assert.rejects(()=>fs.stat(path.join(home,'.agents/skills/ask-report-html')),{code:'ENOENT'});
});
test('existing canonical skill is backed up and overwritten by default',async t=>{
  const {home,installer}=await fixture(t);const folder=path.join(home,'.agents/skills/ask-report-html');
  await fs.mkdir(folder,{recursive:true});await fs.writeFile(path.join(folder,'mine.txt'),'private');
  const plan=await installer.preview(['pi']);assert.equal(plan.canInstall,true);assert.equal(plan.canonicalAction,'overwrite');
  const result=await installer.install(plan.planId);assert.equal(result.skillAction,'overwritten');
  assert.equal(await fs.readFile(path.join(result.canonicalBackup,'mine.txt'),'utf8'),'private');
  assert.equal(await treeHash(folder),bundle.treeHash);
});
test('existing native skill folder is backed up and replaced with its dedicated link',async t=>{
  const {home,installer}=await fixture(t);const folder=path.join(home,'.claude/skills/ask-report-html');
  await fs.mkdir(folder,{recursive:true});await fs.writeFile(path.join(folder,'mine.txt'),'private');
  const plan=await installer.preview(['claude']);assert.equal(plan.canInstall,true);assert.equal(plan.agents[0].links[0].kind,'overwrite');
  const result=await installer.install(plan.planId);const link=result.results[0].links[0];
  assert.equal(await fs.readFile(path.join(link.backup,'mine.txt'),'utf8'),'private');
  assert.equal((await linkState(folder,result.canonicalPath,bundle.treeHash)).kind,'linked');
});
test('file symlink is preserved and actual target is backed up', {skip:process.platform==='win32'},async t=>{
  const {home,installer}=await fixture(t);const file=path.join(home,'.codex/AGENTS.md'),physical=path.join(home,'shared.md');
  await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(physical,'existing');await fs.symlink(physical,file);
  const plan=await installer.preview(['codex']);assert.equal(plan.agents[0].actualTarget,physical);
  const result=await installer.install(plan.planId);
  assert.equal((await fs.lstat(file)).isSymbolicLink(),true);
  assert.ok((await fs.readFile(physical,'utf8')).includes(START));
  assert.equal(await fs.readFile(result.results[0].backup,'utf8'),'existing');
});
test('Windows strategy tries junction without a shell after symlink permission error',async t=>{
  const {home}=await fixture(t),source=path.join(home,'source & folder'),target=path.join(home,'target & folder');
  await fs.mkdir(source);await fs.writeFile(path.join(source,'SKILL.md'),'skill');
  const calls=[];
  const kind=await createDirectoryLink(source,target,{platform:'win32',symlink:async(s,d,type)=>{
    calls.push(type);if(type==='dir')throw Object.assign(new Error('permission'),{code:'EPERM'});
    await fs.symlink(s,d,process.platform==='win32'?'junction':'dir');
  }});
  assert.equal(kind,'junction');assert.deepEqual(calls,['dir','junction']);
});
test('Windows fallback has a regular marker and edited copies can be backed up for replacement',async t=>{
  const {home}=await fixture(t),source=path.join(home,'source'),target=path.join(home,'copy');
  await fs.mkdir(source);await fs.writeFile(path.join(source,'SKILL.md'),'skill');const hash=await treeHash(source);
  assert.equal(await createDirectoryLink(source,target,{platform:'win32',symlink:async()=>{throw Object.assign(new Error('permission'),{code:'EPERM'});}}),'managed-copy');
  assert.equal((await fs.lstat(path.join(target,MARKER))).isFile(),true);
  assert.equal((await linkState(target,source,hash)).kind,'overwrite');
  await fs.writeFile(path.join(target,'SKILL.md'),'user edit');
  assert.equal((await linkState(target,source,hash)).kind,'overwrite');
});
test('wrong and broken links are replaceable entries, not followed targets', {skip:process.platform==='win32'},async t=>{
  const {home}=await fixture(t),source=path.join(home,'source'),target=path.join(home,'target'),wrong=path.join(home,'wrong');
  await fs.mkdir(wrong);await fs.symlink(wrong,target);
  assert.equal((await linkState(target,source,'hash')).kind,'overwrite');
  await fs.unlink(target);await fs.symlink(path.join(home,'missing'),target);
  assert.equal((await linkState(target,source,'hash')).kind,'overwrite');
});
test('runtime failures are reported as partial, not success',async t=>{
  const {home}=await fixture(t);
  const installer=new Installer({home,bundle,platform:'linux',linkOptions:{symlink:async()=>{throw Object.assign(new Error('fixture link failure'),{code:'EPERM'});}}});
  const result=await installer.install((await installer.preview(['claude','codex'])).planId);
  assert.equal(result.status,'partial');assert.equal(result.results.find(r=>r.id==='claude').status,'error');
  assert.equal(result.results.find(r=>r.id==='codex').status,'installed');
  await assert.rejects(()=>fs.stat(path.join(home,'.claude/CLAUDE.md')),{code:'ENOENT'});
});
