import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {reportPolicy,parseMinChangedFiles,readReportPolicy,withReportPolicy,DEFAULT_MIN_CHANGED_FILES} from '../src/report-policy.mjs';
import {Installer} from '../src/installer.mjs';
import {loadBundle} from '../src/bundle.mjs';
import {treeHash,MARKER} from '../src/files.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const bundle=await loadBundle(root);
async function fixture(t,options={}) {
 const parent=path.join(root,'.agent-work/tests');await fs.mkdir(parent,{recursive:true});
 const home=await fs.mkdtemp(path.join(parent,'Report policy-'));t.after(()=>fs.rm(home,{recursive:true,force:true}));
 return {home,installer:new Installer({home,env:{},bundle,...options})};
}
test('threshold is an editable positive safe integer, default 5, without presets',()=>{
 assert.equal(DEFAULT_MIN_CHANGED_FILES,5);assert.deepEqual(reportPolicy(),{minChangedFiles:5});
 for(const n of [1,2,5,7,42,Number.MAX_SAFE_INTEGER])assert.equal(reportPolicy(n).minChangedFiles,n);
 for(const n of [0,-1,1.2,NaN,Infinity,'5',null,Number.MAX_SAFE_INTEGER+1])assert.throws(()=>reportPolicy(n));
 for(const text of ['1','05','7',' 42 '])assert.equal(parseMinChangedFiles(text),Number(text));
 for(const text of ['','0','-1','2.5','1e2','+5','yes','9007199254740992'])assert.throws(()=>parseMinChangedFiles(text));
});
test('missing, old or invalid installed settings fall back to 5 without writes',async t=>{
 const {home}=await fixture(t),file=path.join(home,'auto-report.json');
 assert.deepEqual(await readReportPolicy(home),{minChangedFiles:5});assert.deepEqual(await fs.readdir(home),[]);
 for(const text of ['not JSON','null','{}','{"minChangedFiles":0}','{"minChangedFiles":"7"}']) {
  await fs.writeFile(file,text);assert.equal((await readReportPolicy(home)).minChangedFiles,5);assert.equal(await fs.readFile(file,'utf8'),text);
 }
 await fs.writeFile(file,'{"minChangedFiles":17}');assert.equal((await readReportPolicy(home)).minChangedFiles,17);
});
test('custom bundles keep upstream bytes and the verified default bundle immutable',()=>{
 const custom=withReportPolicy(bundle,{minChangedFiles:7});
 assert.ok(custom.rule.includes('**7 changed files**'));assert.ok(bundle.rule.includes('**5 changed files**'));
 assert.deepEqual(JSON.parse(custom.files['auto-report.json']),{minChangedFiles:7});
 assert.equal(custom.files['scripts/am.mjs'],bundle.files['scripts/am.mjs']);
 assert.equal(withReportPolicy(bundle,{minChangedFiles:5}).treeHash,bundle.treeHash);
 assert.notEqual(custom.treeHash,bundle.treeHash);
});
test('preview stays read-only; install synchronizes numeric policy, rules, hash and refresh guidance',async t=>{
 const {home,installer}=await fixture(t);const plan=await installer.preview(['pi','claude','cursor'],{minChangedFiles:7});
 assert.equal(plan.policy.minChangedFiles,7);assert.ok(plan.rule.includes('**7 changed files**'));assert.deepEqual(await fs.readdir(home),[]);
 const result=await installer.install(plan.planId);
 assert.equal(result.status,'completed');assert.equal(result.policy.minChangedFiles,7);
 assert.equal((await readReportPolicy(result.canonicalPath)).minChangedFiles,7);
 assert.equal(await treeHash(result.canonicalPath),withReportPolicy(bundle,{minChangedFiles:7}).treeHash);
 assert.ok((await fs.readFile(path.join(home,'.pi/agent/AGENTS.md'),'utf8')).includes('**7 changed files**'));
 assert.ok(result.results.find(r=>r.id==='pi').refresh.includes('/reload'));
 assert.ok(result.rule.includes('**7 changed files**'));assert.equal(result.results.find(r=>r.id==='cursor').status,'manual-required');
 const next=new Installer({home,env:{},bundle});assert.equal((await next.state()).policy.minChangedFiles,7);
 const repeat=await next.install((await next.preview(['pi'])).planId);assert.equal(repeat.results[0].ruleAction,'unchanged');
 const changed=await next.install((await next.preview(['pi'],{minChangedFiles:2})).planId);
 assert.equal(changed.results[0].ruleAction,'replaced');assert.ok(changed.results[0].backup);
 assert.equal((await next.state()).policy.minChangedFiles,2);
 // Unselected instructions are not rewritten; they read the authoritative shared setting.
 assert.ok((await fs.readFile(path.join(home,'.claude/CLAUDE.md'),'utf8')).includes('**7 changed files**'));
 assert.ok(changed.rule.includes('takes precedence over an older numeric value'));
});
test('preview locks each numeric value and rejects invalid API values without writing',async t=>{
 const {home,installer}=await fixture(t);
 for(const policy of [null,{}, {minChangedFiles:'7'},{minChangedFiles:0},{minChangedFiles:1.5}])await assert.rejects(()=>installer.preview(['pi'],policy));
 assert.deepEqual(await fs.readdir(home),[]);
 const first=await installer.preview(['pi'],{minChangedFiles:7}),second=await installer.preview(['pi'],{minChangedFiles:9});
 assert.notEqual(first.revision,second.revision);const result=await installer.install(first.planId);assert.equal(result.policy.minChangedFiles,7);
 await assert.rejects(()=>installer.install(second.planId),/变化/);
});
test('external policy changes after preview invalidate installation',async t=>{
 const {installer}=await fixture(t);const result=await installer.install((await installer.preview(['pi'])).planId);
 const plan=await installer.preview(['pi'],{minChangedFiles:7});await fs.writeFile(path.join(result.canonicalPath,'auto-report.json'),'{"minChangedFiles":9}');
 await assert.rejects(()=>installer.install(plan.planId),/变化/);
 assert.equal((await readReportPolicy(result.canonicalPath)).minChangedFiles,9);
});
test('Windows managed copies receive the custom policy and still verify',async t=>{
 const {installer}=await fixture(t,{platform:'win32',linkOptions:{symlink:async()=>{throw Object.assign(new Error('fixture permission'),{code:'EPERM'});}}});
 const result=await installer.install((await installer.preview(['claude'],{minChangedFiles:11})).planId);
 assert.equal(result.status,'completed');const link=result.results[0].links[0];assert.equal(link.kind,'managed-copy');
 assert.equal((await readReportPolicy(link.path)).minChangedFiles,11);
 assert.equal(await treeHash(link.path),withReportPolicy(bundle,{minChangedFiles:11}).treeHash);
 assert.equal(JSON.parse(await fs.readFile(path.join(link.path,MARKER),'utf8')).copyFingerprint,await treeHash(link.path));
});
test('skill gates small automatic edits but explicit HTML requests bypass the numeric gate',async()=>{
 const skill=await fs.readFile(path.join(root,'skills/ask-report-html/SKILL.md'),'utf8');
 assert.ok(skill.includes('at least `minChangedFiles` distinct'));assert.ok(skill.includes('Below the minimum, answer in text without a report'));
 assert.ok(skill.includes('An explicit skill/HTML request bypasses'));assert.ok(skill.includes('edits that were fully reverted do not count'));
 assert.ok(bundle.rule.includes('Count each file once, not fields, lines, tool calls, or commits'));
 assert.ok(bundle.rule.includes('Explicit skill/HTML requests bypass the minimum'));
});
