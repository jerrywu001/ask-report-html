#!/usr/bin/env node
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {startServer} from '../src/server.mjs';
import {Installer} from '../src/installer.mjs';
import {loadBundle} from '../src/bundle.mjs';
import {catalog} from '../src/catalog.mjs';
import {chooseConfiguration} from '../src/prompt.mjs';
import {createCLIOutput} from '../src/cli-output.mjs';
import {createTerminal} from '../src/terminal.mjs';
import {parseMinChangedFiles} from '../src/report-policy.mjs';
import {localizeError} from '../web/i18n.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const args=process.argv.slice(2);
// npx forwards a separator after the package name; npm run consumes its own.
if(args[0]==='--')args.shift();
const command=['configure','web'].includes(args[0])?args.shift():'configure';
if(args[0]==='--')args.shift();
const isolated=args.includes('--home');
const configEnv=isolated?{}:process.env;
const configure=command==='configure';
const options={port:7331,home:os.homedir(),agents:null,yes:false,json:false,dryRun:false,help:false,version:false,language:'en',minChangedFiles:undefined,removeLegacy:undefined};
for(let i=0;i<args.length;i++) {
  const arg=args[i];
  if(arg==='-h'||arg==='--help')options.help=true;
  else if(arg==='-v'||arg==='--version')options.version=true;
  else if(['--remove-legacy','--keep-legacy'].includes(arg)&&configure){if(options.removeLegacy!==undefined)throw new Error('Use either --remove-legacy or --keep-legacy, not both.');options.removeLegacy=arg==='--remove-legacy';}
  else if(arg==='--yes'&&configure)options.yes=true;
  else if(arg==='--dry-run'&&configure)options.dryRun=true;
  else if(arg==='--json'&&configure)options.json=true;
  else if((arg==='--lang'||arg.startsWith('--lang='))&&configure) {
    const value=arg==='--lang'?args[++i]:arg.slice('--lang='.length);
    if(!value||value.startsWith('-'))throw new Error('Missing value for --lang. Use en, en_US, zh, or zh_CN.');
    const locale=value.toLowerCase().replace(/-/g,'_');
    if(!['en','en_us','zh','zh_cn'].includes(locale))throw new Error('Unsupported language: '+value+'. Use en, en_US, zh, or zh_CN.');
    options.language=locale.split('_')[0];
  }
  else if(['--home','--port','--agents','--min-changed-files'].includes(arg)&&args[i+1]) {
    const value=args[++i];
    if(arg==='--port'&&!configure)options.port=Number(value);
    else if(arg==='--home')options.home=path.resolve(value);
    else if(arg==='--agents'&&configure)options.agents=value.split(',').map(s=>s.trim());
    else if(arg==='--min-changed-files'&&configure)options.minChangedFiles=value;
    else throw new Error('Unsupported option: '+arg);
  } else throw new Error('Unknown or incomplete argument: '+arg);
}
if(options.version) {
  console.log(JSON.parse(await fs.readFile(path.join(root,'package.json'),'utf8')).version);
  process.exit(0);
}
if(options.help) {
  if(!configure) {
    console.log(`Ask · Report · HTML

Usage: askreport web [options]
  --port <number>       Loopback port (default: 7331; 0 chooses a free port).
  --home <directory>    Isolated home for testing; ignores agent path overrides.
  -h, --help            Show help without starting the server.
  -v, --version         Show the package version.

Examples:
  npx askreport web
  npx askreport web --port 7331
  npm start -- --port 7331

No browser opens automatically. No files change before installation confirmation.`);
    process.exit(0);
  }
  console.log(options.language==='zh'?`Ask · Report · HTML

用法：askreport [configure] [参数]
不指定 --agents 时依次输入报告门槛、检查旧 skill、选择 agents 并回车安装。

配置参数：
  --lang <语言>             本次终端的初始语言，默认 en；也支持 --lang=值。
                            中文：zh / zh_CN / zh-CN；英文：en / en_US / en-US。
  --min-changed-files <数>  自动报告的最少改动文件数，必须是正整数。
                            不指定时保留已安装值，首次安装默认 5。
  --agents <IDs>           逗号分隔的 agent IDs，跳过交互选择。
  --dry-run                只预览，不修改文件；需要 --agents。
  --yes                    确认安装；需要 --agents，不能与 --dry-run 同用。
  --json                   输出机器可读的 JSON；需要 --agents。
  --remove-legacy          新安装成功后备份并删除列出的旧 skill；需要 --agents。
  --keep-legacy            保留旧 skill；需要 --agents，与 --remove-legacy 互斥。
  --home <目录>            使用隔离 home，忽略 agent 路径环境覆盖，供测试使用。
  -h, --help               显示帮助，不修改文件。
  -v, --version            显示包版本。

Agent IDs：pi, claude, codex, opencode, grok, antigravity, kimi, cursor

示例：
  npx askreport
  npx askreport --lang=zh_CN
  npx askreport -- --lang=zh_CN
  npx askreport --lang=zh_CN -h
  npx askreport --lang=zh_CN --agents pi --min-changed-files 7 --dry-run
  npx askreport --lang=zh_CN --agents pi --min-changed-files 7 --yes

克隆仓库后也可用 npm run configure -- --lang=zh_CN。
说明：npx 不需要额外的 --，但兼容上述写法。
npm run 会接收未放在 -- 后面的 -h；请用 npm run configure -- -h。
--yes 本身不授权删除旧 skill；不指定清理参数时默认保留。
Cursor User Rules 仍需手动粘贴。安装后在 Pi 执行 /reload，其他 agent 重启会话。
不会自动打开浏览器；确认安装前不修改文件。
网页配置：npx askreport web [--port 7331] [--home /isolated/test/home]
克隆仓库的网页入口：npm start -- [参数]`:`Ask · Report · HTML

Usage: askreport [configure] [options]
Without --agents, enter a report threshold, review any old skill, select agents and press Enter to install.

Configuration options:
  --lang <language>        Initial terminal language for this command (default: en).
                            Also accepts --lang=value. Chinese: zh / zh_CN / zh-CN.
                            English: en / en_US / en-US.
  --min-changed-files <n>  Minimum actual changed files for automatic reports; positive integer.
                            Preserves the installed value when omitted, or defaults to 5.
  --agents <IDs>           Comma-separated agent IDs; skip interactive selection.
  --dry-run                Preview only, no files changed; requires --agents.
  --yes                    Confirm installation; requires --agents; not with --dry-run.
  --json                   Output machine-readable JSON; requires --agents.
  --remove-legacy          Back up and remove listed old skills after successful installation.
                            Requires --agents.
  --keep-legacy            Keep old skills; requires --agents; not with --remove-legacy.
  --home <directory>      Use an isolated home and ignore agent-directory environment overrides.
  -h, --help               Show help without changing files.
  -v, --version            Show the package version.

Agent IDs: pi, claude, codex, opencode, grok, antigravity, kimi, cursor

Examples:
  npx askreport
  npx askreport --lang=zh_CN
  npx askreport -- --lang=zh_CN
  npx askreport -h
  npx askreport --agents pi --min-changed-files 7 --dry-run
  npx askreport --agents pi --min-changed-files 7 --yes

From a clone: npm run configure -- --lang=zh_CN.
npx needs no extra --, but the form above is also supported.
npm run consumes -h before --; use npm run configure -- -h for this help.
--yes alone does not authorize old-skill removal; omission keeps old skills.
Cursor User Rules still need manual pasting. Run /reload in Pi or restart other agent sessions after installing.
No browser opens automatically. No files change before installation confirmation.
Web setup: npx askreport web [--port 7331] [--home /isolated/test/home]
From a clone: npm start -- [options]`);
  process.exit(0);
}
if(configure) {
 try {
  if(options.minChangedFiles!==undefined)options.minChangedFiles=parseMinChangedFiles(options.minChangedFiles);
  if(options.yes&&options.dryRun||!options.agents&&(options.yes||options.dryRun||options.json||options.removeLegacy!==undefined))throw new Error('Advanced flags require --agents; use either --dry-run or --yes.');
  const installer=new Installer({home:options.home,env:configEnv,bundle:await loadBundle(root)});
  let approvedLegacy;
  if(!options.agents) {
    const registry=await catalog({home:options.home,env:configEnv});
    const current=options.minChangedFiles??(await installer.policy()).minChangedFiles;
    approvedLegacy=await installer.legacy();
    const selection=await chooseConfiguration(registry.agents,{language:options.language,current,home:options.home,legacy:approvedLegacy,onLanguage:value=>{options.language=value;}});
    if(!selection){createTerminal().write(options.language==='zh'?'已取消，没有修改文件。':'Cancelled. No files changed.','warning');process.exit(0);}
    options.agents=selection.agents;options.minChangedFiles=selection.minChangedFiles;options.removeLegacy=selection.removeLegacy??false;options.yes=true;
  }
  const plan=await installer.preview(options.agents,options.minChangedFiles===undefined?undefined:{minChangedFiles:options.minChangedFiles},options.removeLegacy??false);
  if(approvedLegacy&&plan.removeLegacy&&JSON.stringify(approvedLegacy)!==JSON.stringify(plan.legacy))throw new Error('旧 skill 在确认后发生变化，未写入；请重新运行配置。');
  const display=createCLIOutput({language:options.language,home:options.home});
  if(!options.json)display.legacy(plan,{interactive:!!approvedLegacy});
  if(!plan.canInstall) {
    if(options.json)console.log(JSON.stringify(plan,null,2));
    else for(const a of plan.agents)display.ui.write(a.name+': '+(a.error?localizeError(a.error,options.language):'ready'),a.error?'error':'success');
    process.exitCode=1;
  } else if(options.yes) {
    if(!options.json&&display.ui.tty)display.ui.write(options.language==='zh'?'正在安装…':'Installing…','heading');
    const result=await installer.install(plan.planId);
    if(options.json)console.log(JSON.stringify(result,null,2));
    else display.result(result);
    if(result.status==='partial')process.exitCode=1;
  } else if(options.json)console.log(JSON.stringify(plan,null,2));
  else display.preview(plan);
 } catch(error){const message=localizeError(error.message,options.language);if(options.json)console.error(message);else createTerminal({output:process.stderr}).write(message,'error');process.exitCode=1;}
} else {
  if(!Number.isInteger(options.port)||options.port<0||options.port>65535)throw new Error('Invalid port');
  const app=await startServer({root,home:options.home,port:options.port,env:configEnv});
  console.log('\nAsk · Report · HTML\n'+app.origin+'\nHome: '+options.home+'\nOnly selected agents and explicitly confirmed legacy skill entries are changed after confirmation. Ctrl+C to stop.\n');
  for(const signal of ['SIGINT','SIGTERM'])process.once(signal,async()=>{await app.close();process.exit(0);});
}
