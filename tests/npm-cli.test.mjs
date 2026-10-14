import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn,spawnSync} from 'node:child_process';
import {once} from 'node:events';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const entry=path.join(root,'bin/ask-report-html.mjs');
async function fixture(t) {
  const parent=path.join(root,'.agent-work/tests');await fs.mkdir(parent,{recursive:true});
  const dir=await fs.mkdtemp(path.join(parent,'npm CLI & '));
  const home=path.join(dir,'home');await fs.mkdir(home);
  t.after(()=>fs.rm(dir,{recursive:true,force:true}));
  return {dir,home,run:(args,input)=>spawnSync(process.execPath,[entry,...args,'--home',home],{cwd:dir,input,encoding:'utf8',timeout:10000})};
}
test('default configuration and leading separators accept both npx language forms outside the repo',async t=>{
  const {home,run}=await fixture(t);
  for(const [args,question,cancelled] of [
    [[], 'Minimum changed files for automatic reports', 'Cancelled. No files changed.'],
    [['--lang=zh_CN'], '自动报告的最少改动文件数', '已取消，没有修改文件。'],
    [['--','--lang=zh_CN'], '自动报告的最少改动文件数', '已取消，没有修改文件。'],
    [['configure','--','--lang','zh-CN'], '自动报告的最少改动文件数', '已取消，没有修改文件。']
  ]) {
    const result=run(args,'\n\n');assert.equal(result.status,0,result.stderr);
    assert.ok(result.stdout.includes(question));assert.ok(result.stdout.includes(cancelled));
    assert.ok(!result.stdout.includes('http://127.0.0.1:'));
  }
  assert.deepEqual(await fs.readdir(home),[]);
});
test('default help, web help and version do not write or start a server',async t=>{
  const {home,run}=await fixture(t),{version}=JSON.parse(await fs.readFile(path.join(root,'package.json'),'utf8'));
  for(const args of [['-h'],['--','--help'],['configure','--help']]) {
    const result=run(args);assert.equal(result.status,0,result.stderr);
    assert.ok(result.stdout.includes('Usage: askreport [configure] [options]'));
    assert.ok(result.stdout.includes('npx askreport -- --lang=zh_CN'));
  }
  const zh=run(['--','--lang=zh_CN','-h']);assert.equal(zh.status,0,zh.stderr);assert.ok(zh.stdout.includes('用法：askreport'));
  const web=run(['web','--help']);assert.equal(web.status,0,web.stderr);assert.ok(web.stdout.includes('Usage: askreport web'));
  assert.ok(!web.stdout.includes('Choose your agents'));
  for(const args of [['--version'],['--','-v'],['configure','-v'],['web','--version']]) {
    const result=run(args);assert.equal(result.status,0,result.stderr);assert.equal(result.stdout.trim(),version);
  }
  assert.deepEqual(await fs.readdir(home),[]);
});
test('default advanced flags preserve preview, scoped install and opt-in legacy cleanup',async t=>{
  const {home,run}=await fixture(t),old=path.join(home,'.agents/skills/answer-me-with-html');
  await fs.mkdir(old,{recursive:true});await fs.writeFile(path.join(old,'SKILL.md'),'old skill');
  const before=await fs.readdir(home);
  const preview=run(['--','--lang=zh_CN','--agents','pi','--min-changed-files','7','--dry-run','--json']);
  assert.equal(preview.status,0,preview.stderr);assert.equal(JSON.parse(preview.stdout).policy.minChangedFiles,7);
  assert.deepEqual(await fs.readdir(home),before);
  const installed=run(['--agents','pi','--min-changed-files','7','--yes','--json']);
  assert.equal(installed.status,0,installed.stderr);
  const result=JSON.parse(installed.stdout);assert.equal(result.status,'completed');assert.equal(result.legacy[0].status,'kept');
  assert.equal(await fs.readFile(path.join(old,'SKILL.md'),'utf8'),'old skill');
  assert.equal(JSON.parse(await fs.readFile(path.join(result.canonicalPath,'auto-report.json'),'utf8')).minChangedFiles,7);
  assert.ok((await fs.readFile(path.join(home,'.pi/agent/AGENTS.md'),'utf8')).includes('ask-report-html'));
  await assert.rejects(()=>fs.stat(path.join(home,'.claude')),{code:'ENOENT'});
});
test('invalid default flags and mode-specific flags fail without writes',async t=>{
  const {home,run}=await fixture(t);
  for(const args of [['--lang=fr'],['--lang'],['--port','7331'],['web','--agents','pi'],['web','--yes'],['unknown'],['--agents','pi','--yes','--dry-run']]) {
    const result=run(args);assert.notEqual(result.status,0,args.join(' '));
  }
  assert.deepEqual(await fs.readdir(home),[]);
});
test('explicit web mode starts a loopback server from an unrelated working directory',async t=>{
  const {dir,home}=await fixture(t);
  const child=spawn(process.execPath,[entry,'web','--port','0','--home',home],{cwd:dir,stdio:['ignore','pipe','pipe']});
  t.after(async()=>{if(child.exitCode===null&&child.signalCode===null){const exited=once(child,'exit');child.kill();await exited;}});
  const origin=await new Promise((resolve,reject)=>{
    let stdout='',stderr='';const timer=setTimeout(()=>reject(new Error('Web CLI timed out: '+stderr)),10000);
    child.stderr.on('data',chunk=>{stderr+=chunk;});
    child.stdout.on('data',chunk=>{stdout+=chunk;const url=stdout.match(/http:\/\/127\.0\.0\.1:\d+/)?.[0];if(url){clearTimeout(timer);resolve(url);}});
    child.once('error',error=>{clearTimeout(timer);reject(error);});
    child.once('exit',code=>{clearTimeout(timer);reject(new Error('Web CLI exited '+code+': '+stderr));});
  });
  const response=await fetch(origin);assert.equal(response.status,200);assert.ok((await response.text()).includes('ask-report-html-token'));
  assert.equal((await fetch(origin+'/app.js')).status,200);
  assert.deepEqual(await fs.readdir(home),[]);
});
