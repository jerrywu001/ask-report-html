import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import http from 'node:http';
import {startServer} from '../src/server.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
async function home(t) {
  const parent=path.join(root,'.agent-work/tests');await fs.mkdir(parent,{recursive:true});
  const folder=await fs.mkdtemp(path.join(parent,'API & CLI-'));t.after(()=>fs.rm(folder,{recursive:true,force:true}));return folder;
}
test('server binds loopback, requires token, blocks cross-origin and DNS rebinding',async t=>{
  const dir=await home(t),app=await startServer({root,home:dir,env:{},port:0});t.after(()=>app.close());
  assert.equal(app.server.address().address,'127.0.0.1');
  const page=await fetch(app.origin);const html=await page.text();
  assert.equal(page.status,200);assert.ok(page.headers.get('content-security-policy').includes("frame-ancestors 'none'"));
  const token=html.match(/name="ask-report-html-token" content="([a-f0-9]+)"/)[1];
  assert.equal((await fetch(app.origin+'/api/state')).status,403);
  const headers={'x-ask-report-html-token':token};
  assert.equal((await fetch(app.origin+'/api/state',{headers})).status,200);
  assert.equal((await fetch(app.origin+'/api/state',{headers:{...headers,Origin:'https://evil.example'}})).status,403);
  const forgedHostStatus=await new Promise((resolve,reject)=>{const req=http.get(app.origin+'/api/state',{headers:{...headers,Host:'evil.example'}},res=>{res.resume();resolve(res.statusCode);});req.on('error',reject);});
  assert.equal(forgedHostStatus,403);
  assert.equal((await fetch(app.origin+'/src/server.mjs')).status,404);
  assert.equal((await fetch(app.origin+'/api/install',{headers})).status,405);
  assert.deepEqual(await fs.readdir(dir),[]);
});
test('HTTP preview/install validate request, modify only requested agent and reject reuse',async t=>{
  const dir=await home(t),app=await startServer({root,home:dir,env:{},port:0});t.after(()=>app.close());
  const html=await (await fetch(app.origin)).text(),token=html.match(/name="ask-report-html-token" content="([a-f0-9]+)"/)[1];
  const headers={'x-ask-report-html-token':token,'Content-Type':'application/json'};
  const post=(route,body)=>fetch(app.origin+'/api/'+route,{method:'POST',headers,body:JSON.stringify(body)});
  assert.equal((await post('plan',{agents:['fake']})).status,400);
  assert.equal((await fetch(app.origin+'/api/plan',{method:'POST',headers:{'x-ask-report-html-token':token},body:'{}'})).status,415);
  for(const minChangedFiles of [0,-1,1.5,'7',null])assert.equal((await post('plan',{agents:['kimi'],policy:{minChangedFiles}})).status,400);
  const plan=await (await post('plan',{agents:['kimi'],policy:{minChangedFiles:13}})).json();assert.equal(plan.canInstall,true);assert.equal(plan.policy.minChangedFiles,13);
  assert.deepEqual(await fs.readdir(dir),[]);
  const result=await (await post('install',{planId:plan.planId,policy:{minChangedFiles:1}})).json();assert.equal(result.status,'completed');assert.equal(result.policy.minChangedFiles,13);
  assert.equal((await (await fetch(app.origin+'/api/state',{headers})).json()).policy.minChangedFiles,13);
  assert.ok((await fs.readFile(path.join(dir,'.kimi-code/AGENTS.md'),'utf8')).includes('dual-mode'));
  await assert.rejects(()=>fs.stat(path.join(dir,'.claude')),{code:'ENOENT'});
  assert.equal((await post('install',{planId:plan.planId})).status,400);
});
test('CLI preview does not write and --yes is scoped and idempotent',async t=>{
  const dir=await home(t),entry=path.join(root,'bin/ask-report-html.mjs');
  const run=(args)=>spawnSync(process.execPath,[entry,'configure','--home',dir,'--agents','pi,cursor','--json',...args],{cwd:root,encoding:'utf8',env:{...process.env,PI_CODING_AGENT_DIR:path.join(dir,'must-not-use-env')}});
  const preview=run(['--dry-run']);assert.equal(preview.status,0,preview.stderr);assert.equal(JSON.parse(preview.stdout).canInstall,true);
  assert.deepEqual(await fs.readdir(dir),[]);
  const first=run(['--yes']);assert.equal(first.status,0,first.stderr);
  const result=JSON.parse(first.stdout);assert.equal(result.results.find(r=>r.id==='cursor').status,'manual-required');
  assert.ok((await fs.readFile(path.join(dir,'.pi/agent/AGENTS.md'),'utf8')).includes('dual-mode'));
  await assert.rejects(()=>fs.stat(path.join(dir,'must-not-use-env')),{code:'ENOENT'});
  const again=run(['--yes']);assert.equal(again.status,0,again.stderr);assert.equal(JSON.parse(again.stdout).results[0].ruleAction,'unchanged');
});
test('advanced CLI accepts a custom numeric threshold and preserves it on later runs',async t=>{
  const dir=await home(t),entry=path.join(root,'bin/ask-report-html.mjs');
  const run=args=>spawnSync(process.execPath,[entry,'configure','--home',dir,'--agents','pi','--json',...args],{cwd:root,encoding:'utf8'});
  const preview=run(['--min-changed-files','17','--dry-run']);assert.equal(preview.status,0,preview.stderr);assert.equal(JSON.parse(preview.stdout).policy.minChangedFiles,17);assert.deepEqual(await fs.readdir(dir),[]);
  const install=run(['--min-changed-files','17','--yes']);assert.equal(install.status,0,install.stderr);assert.equal(JSON.parse(install.stdout).policy.minChangedFiles,17);
  const repeat=run(['--yes']);assert.equal(repeat.status,0,repeat.stderr);assert.equal(JSON.parse(repeat.stdout).policy.minChangedFiles,17);
});
test('CLI language aliases support equals and spaced forms throughout configuration',async t=>{
  const dir=await home(t),entry=path.join(root,'bin/ask-report-html.mjs');
  for(const [language,question,picker,cancelled] of [
    ...['zh','zh_CN','zh-CN','ZH_cn'].map(value=>[value,'自动报告的最少改动文件数','选择你的 agents','已取消，没有修改文件。']),
    ...['en','en_US','en-US','EN_us'].map(value=>[value,'Minimum changed files for automatic reports','Choose your agents','Cancelled. No files changed.'])
  ]) {
    for(const flags of [[`--lang=${language}`],['--lang',language]]) {
      const result=spawnSync(process.execPath,[entry,'configure','--home',dir,...flags],{cwd:root,input:'\n\n',encoding:'utf8'});
      assert.equal(result.status,0,result.stderr);for(const text of [question,picker,cancelled])assert.ok(result.stdout.includes(text),flags.join(' ')+' missing '+text);
    }
  }
  assert.deepEqual(await fs.readdir(dir),[]);
});
test('advanced CLI normalizes locale names for previews, JSON and localized errors',async t=>{
  const dir=await home(t),entry=path.join(root,'bin/ask-report-html.mjs');
  const run=args=>spawnSync(process.execPath,[entry,'configure','--home',dir,'--agents','pi',...args],{cwd:root,encoding:'utf8'});
  const preview=run(['--lang=zh_CN','--dry-run']);assert.equal(preview.status,0,preview.stderr);assert.ok(preview.stdout.includes('自动报告：至少改动 5 个实际文件。'));
  const json=run(['--lang','en_US','--dry-run','--json']);assert.equal(json.status,0,json.stderr);assert.equal(JSON.parse(json.stdout).canInstall,true);
  const invalid=run(['--lang=zh_CN','--min-changed-files','0','--dry-run']);assert.notEqual(invalid.status,0);assert.ok(invalid.stderr.includes('大于等于 1 的安全整数'));
  const help=spawnSync(process.execPath,[entry,'configure','--help'],{cwd:root,encoding:'utf8'});assert.equal(help.status,0,help.stderr);assert.ok(help.stdout.includes('--lang=zh_CN'));
  assert.deepEqual(await fs.readdir(dir),[]);
});
test('CLI -h and --help document configuration in the selected language without writes',async t=>{
  const dir=await home(t),entry=path.join(root,'bin/ask-report-html.mjs');
  const options=['--lang','--min-changed-files','--agents','--dry-run','--yes','--json','--remove-legacy','--keep-legacy','--home','-h, --help'];
  for(const help of ['-h','--help']) {
    for(const [flags,title] of [[[],'Configuration options:'],[['--lang=zh_CN'],'配置参数：'],[['--lang','en_US'],'Configuration options:']]) {
      for(const args of [[help,...flags],[...flags,help]]) {
        const result=spawnSync(process.execPath,[entry,'configure','--home',dir,...args],{cwd:root,encoding:'utf8'});
        assert.equal(result.status,0,result.stderr);assert.ok(result.stdout.includes(title));
        for(const option of options)assert.ok(result.stdout.includes(option),'missing '+option);
        assert.ok(result.stdout.includes('npm run configure -- -h'));assert.ok(!result.stdout.includes('Choose your agents'));assert.ok(!result.stdout.includes('选择你的 agents'));
      }
    }
  }
  const web=spawnSync(process.execPath,[entry,'web','-h'],{cwd:root,encoding:'utf8'});assert.equal(web.status,0,web.stderr);assert.ok(web.stdout.includes('Usage: askreport web'));assert.ok(web.stdout.includes('npm start'));
  assert.deepEqual(await fs.readdir(dir),[]);
});
test('CLI rejects missing or unsupported language values without writes',async t=>{
  const dir=await home(t),entry=path.join(root,'bin/ask-report-html.mjs');
  for(const flags of [['--lang'],['--lang='],['--lang','-h'],['--lang','--agents','pi'],['--lang','fr'],['--lang=zh_TW'],['--lang=constructor']]) {
    const result=spawnSync(process.execPath,[entry,'configure','--home',dir,...flags],{cwd:root,encoding:'utf8'});
    assert.notEqual(result.status,0,flags.join(' '));assert.match(result.stderr,/Missing value for --lang|Unsupported language:/);
  }
  assert.deepEqual(await fs.readdir(dir),[]);
});
test('CLI rejects unknown agents, missing values and contradictory confirmation flags',async t=>{
  const dir=await home(t),entry=path.join(root,'bin/ask-report-html.mjs');
  for(const args of [['configure','--agents','fake','--home',dir],['configure','--agents','pi','--yes','--dry-run','--home',dir],['configure','--agents'],...['0','-1','2.5','abc','1e2','9007199254740992'].map(value=>['configure','--agents','pi','--home',dir,'--yes','--min-changed-files',value])]) {
    const p=spawnSync(process.execPath,[entry,...args],{cwd:root,encoding:'utf8'});assert.notEqual(p.status,0);
  }
  assert.deepEqual(await fs.readdir(dir),[]);
});
