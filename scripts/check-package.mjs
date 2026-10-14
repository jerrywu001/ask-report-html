import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const npmCLI=process.env.npm_execpath;
if(!npmCLI)throw new Error('Run this check with npm run test:package.');
const npxCLI=path.join(path.dirname(npmCLI),'npx-cli.js');
const keep=process.argv.includes('--keep');
const parent=path.join(root,'.agent-work/npm-cli');await fs.mkdir(parent,{recursive:true});
const work=await fs.mkdtemp(path.join(parent,'package-'));
const home=path.join(work,'home'),consumer=path.join(work,'consumer'),cache=path.join(work,'npm-cache');
const env={...process.env,HOME:home,USERPROFILE:home,AM_HOME:path.join(work,'renderer-home'),
  npm_config_cache:cache,npm_config_registry:'https://registry.npmjs.org',
  npm_config_userconfig:path.join(work,'empty.npmrc'),npm_config_globalconfig:path.join(work,'empty-global.npmrc'),
  npm_config_audit:'false',npm_config_fund:'false'};
const checks=[];
function run(script,args,{cwd=consumer,input,success=true}={}) {
  const result=spawnSync(process.execPath,[script,...args],{cwd,env,input,encoding:'utf8',timeout:120000,maxBuffer:4*1024*1024});
  assert.ifError(result.error);
  if(success)assert.equal(result.status,0,`${args.join(' ')}\n${result.stderr}\n${result.stdout}`);
  else assert.notEqual(result.status,0,args.join(' '));
  return result;
}
// An explicit value avoids older npx parsers treating --no as taking the package name.
const npx=(args,options)=>run(npxCLI,['--offline','--yes=false','askreport',...args],options);
try {
  await fs.mkdir(home);await fs.mkdir(consumer);
  await fs.writeFile(path.join(work,'empty.npmrc'),'');await fs.writeFile(path.join(work,'empty-global.npmrc'),'');
  await fs.writeFile(path.join(consumer,'package.json'),JSON.stringify({name:'askreport-package-consumer',private:true}));
  const [packed]=JSON.parse(run(npmCLI,['pack','--ignore-scripts','--json','--pack-destination',work],{cwd:root}).stdout);
  const paths=new Set(packed.files.map(file=>file.path));
  const required=['package.json','bin/ask-report-html.mjs','assets/ask-report-html-skill.zip','assets/skill-manifest.json',
    'src/installer.mjs','src/bundle.mjs','web/index.html','web/app.js','web/i18n.js','web/style.css',
    'README.md','README.zh-CN.md','LICENSE','THIRD_PARTY_NOTICES.md'];
  for(const file of required)assert.ok(paths.has(file),'Missing packed file: '+file);
  for(const file of paths)assert.ok(/^(?:bin\/|src\/|web\/|assets\/(?:ask-report-html-skill\.zip|skill-manifest\.json)$|package\.json$|README(?:\.zh-CN)?\.md$|LICENSE$|THIRD_PARTY_NOTICES\.md$)/.test(file),'Unexpected packed file: '+file);
  assert.ok((packed.files.find(file=>file.path==='bin/ask-report-html.mjs').mode&0o111)!==0,'CLI must be executable');
  const archive=path.join(work,packed.filename);
  run(npmCLI,['install','--ignore-scripts','--no-audit','--no-fund','--package-lock=false',archive]);
  const packageRoot=path.join(consumer,'node_modules/askreport');
  const pkg=JSON.parse(await fs.readFile(path.join(packageRoot,'package.json'),'utf8'));
  assert.equal(pkg.name,'askreport');assert.notEqual(pkg.private,true);assert.equal(pkg.bin.askreport,'bin/ask-report-html.mjs');
  for(const hook of ['preinstall','install','postinstall','prepare'])assert.ok(!pkg.scripts[hook],'Unexpected install hook: '+hook);
  const {loadBundle}=await import(pathToFileURL(path.join(packageRoot,'src/bundle.mjs')));
  const bundle=await loadBundle(packageRoot);assert.equal(bundle.version,pkg.version);assert.ok(bundle.files.LICENSE);
  checks.push('Packed runtime whitelist, executable, licenses and archive integrity');

  for(const [args,expected] of [
    [['-h'],'Usage: askreport [configure] [options]'],
    [['--lang=zh_CN','-h'],'用法：askreport'],
    [['--','--lang=zh_CN','-h'],'用法：askreport'],
    [['configure','--lang','zh-CN','-h'],'用法：askreport'],
    [['web','-h'],'Usage: askreport web'],
    [['--version'],pkg.version]
  ])assert.ok(npx(args).stdout.includes(expected),'Missing npx output for '+args.join(' ')+': '+expected);
  for(const [args,expected] of [
    [[], 'Minimum changed files for automatic reports'],
    [['--lang=zh_CN'], '自动报告的最少改动文件数'],
    [['--','--lang=zh_CN'], '自动报告的最少改动文件数']
  ]) {
    const result=npx(args,{input:'\n\n'});assert.ok(result.stdout.includes(expected));
    assert.match(result.stdout,/Cancelled\. No files changed\.|已取消，没有修改文件。/);
  }
  npx(['--lang=unsupported'],{success:false});
  const preview=JSON.parse(npx(['--','--lang=zh_CN','--home',home,'--agents','pi,claude','--min-changed-files','7','--dry-run','--json']).stdout);
  assert.equal(preview.policy.minChangedFiles,7);assert.deepEqual(await fs.readdir(home),[]);
  checks.push('Actual offline npx: default, locales, separator, configure, help, version, cancellation and read-only preview');

  const old=path.join(home,'.agents/skills/answer-me-with-html');await fs.mkdir(old,{recursive:true});
  await fs.writeFile(path.join(old,'SKILL.md'),'Legacy fixture; preserve unless cleanup is explicitly approved.');
  const result=JSON.parse(npx(['--home',home,'--agents','pi,claude','--min-changed-files','7','--yes','--json']).stdout);
  assert.equal(result.status,'completed');assert.equal(result.results.length,2);assert.equal(result.legacy[0].status,'kept');
  const canonical=path.join(home,'.agents/skills/ask-report-html');assert.equal(result.canonicalPath,canonical);
  const repeat=JSON.parse(npx(['--home',home,'--agents','pi,claude','--yes','--json']).stdout);
  assert.equal(repeat.policy.minChangedFiles,7);assert.ok(repeat.results.every(agent=>agent.ruleAction==='unchanged'));
  assert.ok((await fs.readFile(path.join(home,'.pi/agent/AGENTS.md'),'utf8')).includes('ask-report-html'));
  assert.ok((await fs.readFile(path.join(home,'.claude/CLAUDE.md'),'utf8')).includes('ask-report-html'));
  const linked=path.join(home,'.claude/skills/ask-report-html');
  if(result.results.find(agent=>agent.id==='claude').links[0].kind==='managed-copy')
    assert.equal(await fs.readFile(path.join(linked,'SKILL.md'),'utf8'),await fs.readFile(path.join(canonical,'SKILL.md'),'utf8'));
  else assert.equal(await fs.realpath(linked),await fs.realpath(canonical));
  await assert.rejects(()=>fs.stat(path.join(home,'.codex')),{code:'ENOENT'});
  assert.ok((await fs.readFile(path.join(old,'SKILL.md'),'utf8')).includes('preserve'));
  checks.push('Isolated scoped install, persistent skill path, idempotence, threshold preservation and default legacy retention');

  const {startServer}=await import(pathToFileURL(path.join(packageRoot,'src/server.mjs')));
  const webHome=path.join(work,'web-home');await fs.mkdir(webHome);
  const app=await startServer({root:packageRoot,home:webHome,env:{},port:0});
  try {
    for(const route of ['/','/app.js','/i18n.js','/style.css'])assert.equal((await fetch(app.origin+route)).status,200);
    assert.equal((await fetch(app.origin+'/api/state')).status,403);
    assert.deepEqual(await fs.readdir(webHome),[]);
  } finally {await app.close();}
  checks.push('Packed web resources and token protection; no writes before confirmation');

  await fs.rm(cache,{recursive:true,force:true});await fs.rm(consumer,{recursive:true,force:true});
  const draft=path.join(work,'draft.md'),output=path.join(work,'rendered.html');
  await fs.writeFile(draft,'---\ntitle: Packed skill smoke test\nlang: en\n---\n## A Result\nThe installed skill renders without the npm cache or installer package.\n');
  run(path.join(canonical,'scripts/render.mjs'),['render',draft,'--no-open','-o',output],{cwd:work});
  const html=await fs.readFile(output,'utf8');assert.ok(html.includes('Packed skill smoke test'));
  checks.push('Installed renderer works after deleting the npm cache and consumer package');
  const summary={name:packed.name,version:packed.version,entryCount:packed.entryCount,size:packed.size,unpackedSize:packed.unpackedSize,checks,kept:keep,work:keep?work:undefined};
  await fs.writeFile(path.join(parent,'package-summary.json'),JSON.stringify(summary,null,2)+'\n');
  console.log(JSON.stringify(summary,null,2));
} finally {
  if(!keep)await fs.rm(work,{recursive:true,force:true});
  else console.log('Package-check fixture retained: '+work);
}
