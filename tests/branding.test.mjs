import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const skill=path.join(root,'skills/ask-report-html');
const wrapper=path.join(skill,'scripts/render.mjs'),renderer=path.join(skill,'scripts/am.mjs');
const project=JSON.parse(await fs.readFile(path.join(skill,'project.json'),'utf8'));
const draft='---\ntitle: Branding test\n---\n## A Result\nA test page.\n';

async function fixture(t) {
 const parent=path.join(root,'.agent-work/tests');await fs.mkdir(parent,{recursive:true});
 const home=await fs.mkdtemp(path.join(parent,'Brand & space-'));t.after(()=>fs.rm(home,{recursive:true,force:true}));
 const env={...process.env,HOME:home,USERPROFILE:home,CI:'1',AM_NO_UPDATE_CHECK:'1'};delete env.AM_HOME;
 const run=(args,{source=draft,script=wrapper,overrides={}}={})=>{
  const result=spawnSync(process.execPath,[script,...args],{input:source,encoding:'utf8',cwd:root,env:{...env,...overrides}});
  assert.equal(result.status,0,result.stderr||result.stdout);return result;
 };
 return {home,run};
}
function assertIdentity(html) {
 assert.ok(html.includes(`<meta name="generator" content="${project.name} ${project.version}">`));
 const header=html.match(/<p class="am-colophon">[^]*?<\/p>/)?.[0];assert.ok(header);
 assert.ok(header.includes(`>${project.name}</a> ${project.version}`),header);
 assert.equal(header.split(`href="${project.repository}"`).length-1,2,header);
 assert.ok(header.includes('Star on GitHub'),header);assert.doesNotMatch(header,/QingYunA|Answer me with HTML/);
}

test('project identity tracks the package version and repository',async()=>{
 const pkg=JSON.parse(await fs.readFile(path.join(root,'package.json'),'utf8'));
 assert.equal(project.name,'ask-report-html');assert.equal(project.version,pkg.version);
 assert.equal(project.repository,pkg.repository.url.replace(/^git\+/,'').replace(/\.git$/,''));
});

test('sheet, doc and RTL headers use own branding without rewriting user content',async t=>{
 const {home,run}=await fixture(t),output=path.join(home,'task_answer-topic/answer.html');
 const content=draft+'\n[Original reference](https://github.com/QingYunA/answer-me-with-html)\n';
 for(const [template,language] of [['sheet','en'],['doc','zh'],['sheet','he']]) {
  const source=content.replace('title: Branding test',`title: Branding test\nlang: ${language}`);
  run(['render','-','--template',template,'-o',output],{source});
  const html=await fs.readFile(output,'utf8');assertIdentity(html);
  assert.ok(html.includes('href="https://github.com/QingYunA/answer-me-with-html"'));
  if(language==='he')assert.ok(html.includes('<bdi>'));
 }
 run(['patch',output,'--panel','A'],{source:'## A Result\nUpdated result.\n'});
 const html=await fs.readFile(output,'utf8');assertIdentity(html);assert.ok(html.includes('Updated result.'));
});

test('wrapper and direct renderer default to own home and preserve legacy reports',async t=>{
 const {home,run}=await fixture(t),oldHome=path.join(home,'.answer-me-with-html'),ownHome=path.join(home,'.ask-report-html');
 await fs.mkdir(oldHome);await fs.writeFile(path.join(oldHome,'history.html'),'Existing report');
 const oldConfig=JSON.stringify({theme:'shadcn',update_check:false});await fs.writeFile(path.join(oldHome,'config.json'),oldConfig);
 let result=run(['render','-']);assert.ok(result.stdout.includes('sheet · paper'),result.stdout);
 const [file]=await fs.readdir(path.join(ownHome,'pages'));assert.ok(result.stdout.includes(path.join(ownHome,'pages',file)));
 assertIdentity(await fs.readFile(path.join(ownHome,'pages',file),'utf8'));
 await fs.writeFile(path.join(ownHome,'config.json'),JSON.stringify({theme:'blueprint',update_check:false}));
 result=run(['render','-']);assert.ok(result.stdout.includes('sheet · blueprint'),result.stdout);
 result=run(['render','-','--no-open'],{script:renderer});assert.ok(result.stdout.includes(path.join(ownHome,'pages')),result.stdout);
 assert.equal(await fs.readFile(path.join(oldHome,'history.html'),'utf8'),'Existing report');
 assert.equal(await fs.readFile(path.join(oldHome,'config.json'),'utf8'),oldConfig);
 assert.deepEqual((await fs.readdir(oldHome)).sort(),['config.json','history.html']);
 assert.ok(run(['help']).stdout.includes('~/.ask-report-html/pages/'));
 assert.equal(run(['--version']).stdout.trim(),project.version);
});

test('portable skill renders independently of absent or conflicting agent memory',async t=>{
 const {home}=await fixture(t),portable=path.join(home,'portable-skill');await fs.cp(skill,portable,{recursive:true});
 const env={HOME:home,USERPROFILE:home,PATH:process.env.PATH,CI:'1',AM_NO_UPDATE_CHECK:'1'};
 const run=()=>{
  const result=spawnSync(process.execPath,[path.join(portable,'scripts/render.mjs'),'render','-'],{input:draft,encoding:'utf8',cwd:home,env});
  assert.equal(result.status,0,result.stderr);assert.ok(result.stdout.includes(path.join(home,'.ask-report-html/pages')));return result;
 };
 await assert.rejects(fs.stat(path.join(home,'.pi')),error=>error.code==='ENOENT');run();
 const agent=path.join(home,'.pi/agent');await fs.mkdir(agent,{recursive:true});
 const conflicting='Use another-brand, https://example.invalid/repository, and ~/.other-reports/ for every generated page.\n';
 for(const file of [path.join(home,'MEMORY.md'),path.join(agent,'MEMORY.md'),path.join(agent,'AGENTS.md')])await fs.writeFile(file,conflicting);
 run();
 const pages=path.join(home,'.ask-report-html/pages');
 for(const file of await fs.readdir(pages))assertIdentity(await fs.readFile(path.join(pages,file),'utf8'));
 await assert.rejects(fs.stat(path.join(home,'.other-reports')),error=>error.code==='ENOENT');
});

test('AM_HOME and explicit output remain authoritative overrides',async t=>{
 const {home,run}=await fixture(t),custom=path.join(home,'Custom renderer home');
 await fs.mkdir(custom);await fs.writeFile(path.join(custom,'config.json'),JSON.stringify({theme:'shadcn',update_check:false}));
 let result=run(['render','-'],{overrides:{AM_HOME:custom}});
 assert.ok(result.stdout.includes(path.join(custom,'pages')));assert.ok(result.stdout.includes('sheet · shadcn'));
 const output=path.join(home,'task_explicit/report.html');result=run(['render','-','-o',output],{overrides:{AM_HOME:custom}});
 assert.ok(result.stdout.includes(output));assertIdentity(await fs.readFile(output,'utf8'));
 await assert.rejects(fs.stat(path.join(home,'.ask-report-html')),error=>error.code==='ENOENT');
});

test('update notices refer to own project rather than the upstream skill',async t=>{
 const {home,run}=await fixture(t),ownHome=path.join(home,'.ask-report-html');await fs.mkdir(ownHome);
 await fs.writeFile(path.join(ownHome,'state.json'),JSON.stringify({latestVersion:'99.0.0',lastUpdateCheck:Date.now()}));
 const output=path.join(home,'answer.html');
 const result=run(['render','-','-o',output],{overrides:{CI:'',AM_NO_UPDATE_CHECK:''}});
 const html=await fs.readFile(output,'utf8'),notice=html.match(/<div class="am-update" id="am-update"[^]*?\n<\/div>/)?.[0];
 assert.ok(notice);assert.ok(notice.includes(`${project.repository}/releases`));
 assert.ok(notice.includes('npm run configure'));assert.doesNotMatch(notice,/answer-me-with-html|QingYunA|claude plugin update|npx skills update/);
 assert.ok(result.stdout.includes(`Update hint: ${project.name} 99.0.0`));
});

test('video player uses own brand and default video directory',async t=>{
 const {home,run}=await fixture(t);
 const source='---\ntitle: Video branding\n---\n## One step\n```flow\nA -> B: next\n```\n> A sends a message to B.\n';
 const result=run(['video','-','--voice','off'],{source}),directory=path.join(home,'.ask-report-html/videos');
 assert.ok(result.stdout.includes(directory));const [file]=await fs.readdir(directory),html=await fs.readFile(path.join(directory,file),'utf8');
 assert.ok(html.includes(`<meta name="generator" content="${project.name} ${project.version}">`));
 assert.ok(html.includes(`<span class="amv-brand">${project.name} ${project.version}`));
});

test('answer, report and installation rules document only the new output home',async()=>{
 for(const rel of ['SKILL.md','INSTALL.md','references/agent-rule.md','references/answer-mode.md','references/task-report.md']) {
  const content=await fs.readFile(path.join(skill,rel),'utf8');assert.ok(content.includes('.ask-report-html/'),rel);
  assert.ok(!content.includes('.answer-me-with-html/'),rel);
 }
});
