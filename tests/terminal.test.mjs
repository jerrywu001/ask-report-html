import test from 'node:test';
import assert from 'node:assert/strict';
import {PassThrough,Writable} from 'node:stream';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {createTerminal,displayWidth,wrapText,tailText,plainText,createFrame} from '../src/terminal.mjs';
import {chooseAgents,chooseMinChangedFiles,chooseLegacyRemoval,chooseConfiguration} from '../src/prompt.mjs';
import {createCLIOutput} from '../src/cli-output.mjs';
const sgr=/\x1b\[[0-9;]*m/;
function terminal({tty=true,columns=80,rows=24}={}) {
 const input=new PassThrough();input.isTTY=tty;input.isRaw=false;input.setRawMode=value=>{input.isRaw=value;};let text='';
 const output=new Writable({write(chunk,encoding,done){text+=chunk;done();}});Object.assign(output,{isTTY:tty,columns,rows});
 return {input,output,text:()=>text};
}
test('colors use semantic ANSI styles only for capable TTY output',()=>{
 const tty=terminal();const ui=createTerminal({...tty,env:{TERM:'xterm-256color'}});assert.equal(ui.color,true);
 for(const tone of ['heading','accent','success','warning','error','muted'])assert.match(ui.paint('Label',tone),sgr);
 assert.equal(plainText(ui.paint('Label','success')),'Label');assert.equal(ui.paint('\x1b[31mUnsafe\x1b[0m','accent').includes('\x1b[31m'),false);
 for(const env of [{NO_COLOR:''},{NO_COLOR:'1',FORCE_COLOR:'1'},{TERM:'dumb'},{FORCE_COLOR:'0'}])assert.equal(createTerminal({...tty,env}).color,false);
 assert.equal(createTerminal({...terminal({tty:false}),env:{FORCE_COLOR:'1'}}).color,false);
});
test('wrapping counts terminal cells, not bytes, including CJK and grapheme clusters',()=>{
 assert.equal(displayWidth('中文abc'),7);assert.equal(displayWidth('e\u0301'),1);assert.equal(displayWidth('👩‍💻'),2);assert.equal(displayWidth('🇨🇳'),2);assert.equal(displayWidth('\x1b[36m中文\x1b[0m'),4);
 for(const source of ['Short words and longer words','自动报告的最少改动文件数','prefix/very-long-path-name/answer-me-with-html','A👩‍💻B🇨🇳e\u0301']) {
  const rows=wrapText(source,12);assert.ok(rows.every(row=>displayWidth(row)<=12),rows.join('|'));
  assert.equal(rows.join('').replace(/ /g,''),source.replace(/ /g,''));
 }
 assert.equal(displayWidth(tailText('12345678901234567890',8)),8);assert.ok(tailText('中文中文中文',6).startsWith('…'));
});
test('numeric input, warning and selection are styled; long input stays within the terminal',async()=>{
 const tty=terminal({columns:34});const promise=chooseMinChangedFiles({...tty,env:{TERM:'xterm'}});tty.input.write('0\r');assert.ok(tty.text().includes('\x1b[31m'));
 tty.input.write('\x7f123456789012345678901234567890');assert.ok(tty.text().includes('…'));tty.input.write('q');assert.equal(await promise,null);assert.equal(tty.input.isRaw,false);tty.input.destroy();
 const pick=terminal();const selection=chooseAgents([{id:'pi',name:'Pi'},{id:'codex',name:'Codex'}],{...pick,env:{TERM:'xterm'}});pick.input.write('1');pick.input.write('\x1b[B');assert.ok(pick.text().includes('\x1b[32m'));assert.ok(pick.text().includes('\x1b[1;36m'));assert.ok(plainText(pick.text()).includes('selected: 1 / 2'));pick.input.write('\r');assert.deepEqual(await selection,['pi']);pick.input.destroy();
});
test('legacy warning is amber and accepting N leaves a visible choice without changing semantics',async()=>{
 const tty=terminal();const result=chooseLegacyRemoval([{path:'example/answer-me-with-html',removable:true}],{...tty,env:{TERM:'xterm'}});assert.ok(tty.text().includes('\x1b[33m'));tty.input.write('n');assert.equal(await result,false);assert.ok(plainText(tty.text()).includes('❯ N'));tty.input.destroy();
});
test('NO_COLOR and FORCE_COLOR=0 preserve interactive keys without SGR color codes',async()=>{
 for(const env of [{NO_COLOR:''},{FORCE_COLOR:'0'}]){
  const tty=terminal();const promise=chooseAgents([{id:'pi',name:'Pi'}],{...tty,env});tty.input.write('1\r');assert.deepEqual(await promise,['pi']);assert.ok(!sgr.test(tty.text()));assert.equal(tty.input.isRaw,false);tty.input.destroy();
 }
});
test('TERM=dumb and redirected output use line prompts without any ANSI escapes',async()=>{
 for(const [ttyMode,env] of [[true,{TERM:'dumb'}],[false,{FORCE_COLOR:'1'}]]){
  const tty=terminal({tty:ttyMode});const promise=chooseConfiguration([{id:'pi',name:'Pi'}],{...tty,env});tty.input.end('7\n1\n');assert.deepEqual(await promise,{agents:['pi'],minChangedFiles:7});assert.ok(!tty.text().includes('\x1b'));assert.equal(tty.input.isRaw,false);
 }
});
test('language switches and resize retain focus and selected agents in a short terminal',async()=>{
 const tty=terminal({columns:42,rows:12}),agents=Array.from({length:8},(_,i)=>({id:'agent'+i,name:'Agent '+i}));
 const promise=chooseAgents(agents,{...tty,env:{TERM:'xterm'}});tty.input.write('1');for(let i=0;i<6;i++)tty.input.write('\x1b[B');tty.input.write(' ');tty.input.write('l');tty.output.columns=34;tty.output.emit('resize');assert.ok(plainText(tty.text()).includes('已选'));
 tty.input.write('\r');assert.deepEqual(await promise,['agent0','agent6']);assert.equal(tty.input.isRaw,false);assert.equal(tty.output.listenerCount('resize'),0);tty.input.destroy();
});
test('EOF and Ctrl+D cancel and restore terminal state',async()=>{
 for(const end of ['eof','ctrl-d']){const tty=terminal();const promise=chooseMinChangedFiles({...tty,env:{TERM:'xterm'}});end==='eof'?tty.input.end():tty.input.write('\x04');assert.equal(await promise,null);assert.equal(tty.input.isRaw,false);assert.equal(tty.output.listenerCount('resize'),0);assert.ok(tty.text().endsWith('\x1b[?25h\n'));}
});
test('frame redraw counts physical rows and keeps editable caret below control text',()=>{
 const tty=terminal({columns:30}),ui=createTerminal({...tty,env:{TERM:'xterm'}}),frame=createFrame(ui);frame.draw(ui.lines('中文自动报告','heading'));frame.draw([ui.paint('  ❯ 10','accent')],{input:true});frame.below();assert.ok(tty.text().includes('\x1b[1A'));assert.ok(tty.text().includes('\x1b[1B\r'));
});
test('result output separates statuses, paths, backups and reload actions',()=>{
 const tty=terminal(),display=createCLIOutput({...tty,env:{TERM:'xterm'},language:'zh',home:'example'});
 display.result({status:'partial',canonicalPath:'example/.agents/skills/ask-report-html',skillAction:'created',policy:{minChangedFiles:5},results:[{name:'Pi',id:'pi',status:'installed',ruleAction:'created',rulesPath:'example/.pi/agent/AGENTS.md',backup:'example/backup',links:[]},{name:'Cursor',id:'cursor',status:'manual-required',links:[]},{name:'Codex',id:'codex',status:'error',error:'fixture error',links:[]}],legacy:[],rule:'Rule'});
 for(const code of ['\x1b[32m','\x1b[33m','\x1b[31m','\x1b[36m'])assert.ok(tty.text().includes(code));const text=plainText(tty.text());assert.ok(text.includes('/reload'));assert.ok(text.includes('~/.pi/agent/AGENTS.md'));assert.ok(text.includes('Backup:'));assert.ok(text.includes('fixture error'));
});
test('completed extraction with manual Cursor rules keeps an amber pending headline',()=>{
 const tty=terminal(),display=createCLIOutput({...tty,env:{TERM:'xterm'},language:'zh'});
 display.result({status:'completed',canonicalPath:'example/skill',skillAction:'created',policy:{minChangedFiles:5},results:[{name:'Cursor',id:'cursor',status:'manual-required',links:[]}],legacy:[],rule:'Rule'});
 assert.ok(plainText(tty.text()).includes('Cursor 规范待粘贴'));assert.ok(tty.text().includes('\x1b[33m'));assert.ok(!plainText(tty.text()).includes('✓ 安装完成'));
});
test('CLI JSON remains parseable and redirected human output stays uncolored',async t=>{
 const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),parent=path.join(root,'.agent-work/tests');await fs.mkdir(parent,{recursive:true});const home=await fs.mkdtemp(path.join(parent,'TTY colors-'));t.after(()=>fs.rm(home,{recursive:true,force:true}));
 const entry=path.join(root,'bin/ask-report-html.mjs');
 const json=spawnSync(process.execPath,[entry,'configure','--home',home,'--agents','pi','--dry-run','--json'],{cwd:root,encoding:'utf8',env:{...process.env,FORCE_COLOR:'1'}});assert.equal(json.status,0,json.stderr);assert.ok(JSON.parse(json.stdout).canInstall);assert.ok(!json.stdout.includes('\x1b'));
 const plain=spawnSync(process.execPath,[entry,'configure','--home',home,'--agents','pi','--dry-run'],{cwd:root,encoding:'utf8',env:{...process.env,FORCE_COLOR:'1'}});assert.equal(plain.status,0,plain.stderr);assert.ok(!plain.stdout.includes('\x1b'));assert.deepEqual(await fs.readdir(home),[]);
});
