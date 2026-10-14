import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {Installer} from '../src/installer.mjs';
import {loadBundle} from '../src/bundle.mjs';
import {pathSnapshot,replaceSkillEntry,MARKER} from '../src/files.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');const bundle=await loadBundle(root);
async function fixture(t){const parent=path.join(root,'.agent-work/tests');await fs.mkdir(parent,{recursive:true});const home=await fs.mkdtemp(path.join(parent,'Overwrite & spaces-'));t.after(()=>fs.rm(home,{recursive:true,force:true}));return {home,installer:new Installer({home,bundle})};}
test('rule equality skips config write even though the existing skill is overwritten',async t=>{
 const {home,installer}=await fixture(t);const file=path.join(home,'.pi/agent/AGENTS.md');await fs.mkdir(path.dirname(file),{recursive:true});const content='# Other\nKeep.\n\n'+bundle.rule+'\n## Tail\nKeep tail.\n';await fs.writeFile(file,content);
 const first=await installer.install((await installer.preview(['pi'])).planId);assert.equal(first.results[0].ruleAction,'unchanged');assert.equal(first.results[0].backup,null);assert.equal(await fs.readFile(file,'utf8'),content);
 const again=await installer.install((await installer.preview(['pi'])).planId);assert.equal(again.skillAction,'overwritten');assert.ok(again.canonicalBackup);assert.equal(again.results[0].ruleAction,'unchanged');
});
test('different existing unmarked rule is replaced once and the original is backed up',async t=>{
 const {home,installer}=await fixture(t);const file=path.join(home,'.codex/AGENTS.md');await fs.mkdir(path.dirname(file),{recursive:true});const original='# Other\nKeep.\n\n## Ask · Report · HTML\n\n[ask-report-html dual-mode]\n- Old policy.\n\n## Tail\nKeep tail.\n';await fs.writeFile(file,original);
 const plan=await installer.preview(['codex']);assert.equal(plan.agents[0].action,'replace');const result=await installer.install(plan.planId);assert.equal(result.results[0].ruleAction,'replaced');assert.equal(await fs.readFile(result.results[0].backup,'utf8'),original);
 const text=await fs.readFile(file,'utf8');assert.ok(text.startsWith('# Other\nKeep.\n\n'));assert.ok(text.endsWith('## Tail\nKeep tail.\n'));assert.equal(text.split('## Ask · Report · HTML').length-1,1);
});
test('external skill edit invalidates a previous preview rather than being silently overwritten',async t=>{
 const {home,installer}=await fixture(t);const folder=path.join(home,'.agents/skills/ask-report-html');await fs.mkdir(folder,{recursive:true});await fs.writeFile(path.join(folder,'old.txt'),'old');const plan=await installer.preview(['pi']);await fs.writeFile(path.join(folder,'old.txt'),'external');await assert.rejects(()=>installer.install(plan.planId),/变化/);assert.equal(await fs.readFile(path.join(folder,'old.txt'),'utf8'),'external');
});
test('a canonical link is backed up as a descriptor; its external target is never removed',async t=>{
 const {home,installer}=await fixture(t);const external=path.join(home,'external'),folder=path.join(home,'.agents/skills/ask-report-html');await fs.mkdir(external);await fs.writeFile(path.join(external,'keep.txt'),'keep');await fs.mkdir(path.dirname(folder),{recursive:true});await fs.symlink(external,folder,process.platform==='win32'?'junction':'dir');
 const result=await installer.install((await installer.preview(['pi'])).planId);const descriptor=JSON.parse(await fs.readFile(result.canonicalBackup,'utf8'));assert.equal(descriptor.kind,'ask-report-html/link-backup');assert.equal(await fs.readFile(path.join(external,'keep.txt'),'utf8'),'keep');assert.equal((await fs.lstat(folder)).isSymbolicLink(),false);
});
test('failed swap restores the old entry and leaves no partial replacement',async t=>{
 const {home}=await fixture(t),target=path.join(home,'skill');await fs.mkdir(target);await fs.writeFile(path.join(target,'old.txt'),'old');const before=await pathSnapshot(target);
 await assert.rejects(()=>replaceSkillEntry(target,{expectedFingerprint:before.fingerprint,backupRoot:path.join(home,'backups'),build:async stage=>{await fs.mkdir(stage);await fs.writeFile(path.join(stage,'new.txt'),'new');},rename:async(source,destination)=>{if(source.includes('.new-'))throw new Error('fixture publish failure');await fs.rename(source,destination);}}),/fixture/);
 assert.equal(await fs.readFile(path.join(target,'old.txt'),'utf8'),'old');assert.ok(!(await fs.readdir(home)).some(name=>name.includes('.new-')||name.includes('.old-')));
});
test('Windows managed copies are overwritten with a corrected final-path marker',async t=>{
 const {home}=await fixture(t);const installer=new Installer({home,bundle,platform:'win32',linkOptions:{symlink:async()=>{throw Object.assign(new Error('permission'),{code:'EPERM'});}}});const first=await installer.install((await installer.preview(['claude'])).planId);const target=first.results[0].links[0].path;
 assert.equal(first.results[0].links[0].kind,'managed-copy');const marker=JSON.parse(await fs.readFile(path.join(target,MARKER),'utf8'));assert.equal(marker.copyPath,path.resolve(target));await fs.writeFile(path.join(target,'SKILL.md'),'user edit');
 const next=await installer.install((await installer.preview(['claude'])).planId);assert.equal(next.status,'completed');assert.equal(await fs.readFile(path.join(next.results[0].links[0].backup,'SKILL.md'),'utf8'),'user edit');
});
