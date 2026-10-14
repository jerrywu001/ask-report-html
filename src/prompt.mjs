import readline from 'node:readline';
import {translate,localizeError} from '../web/i18n.js';
import {DEFAULT_MIN_CHANGED_FILES,parseMinChangedFiles,reportPolicy} from './report-policy.mjs';
import {createTerminal,createFrame,tailText,displayWidth} from './terminal.mjs';

const TEXT={en:{title:'Choose your agents',help:'↑/↓ move · Space select · Enter install · Esc cancel · L 中文',policy:'Existing skill: back up and overwrite. Rules: skip matches, update differences.',empty:'Select at least one agent before pressing Enter.',line:'Enter agent numbers or IDs, separated by spaces/commas. Enter confirms installation:',invalid:'Invalid selection. Use the listed numbers or IDs.',manual:'manual User Rules step',selected:'selected',more:'more'},zh:{title:'选择你的 agents',help:'↑/↓ 移动 · 空格勾选 · 回车安装 · Esc 取消 · L English',policy:'同名 skill 先备份再覆盖；规范一致跳过，不一致原位更新。',empty:'请至少选择一个 agent，再按回车。',line:'输入 agent 编号或 ID，用空格或逗号分隔；回车确认安装：',invalid:'选择无效，请使用列表中的编号或 ID。',manual:'User Rules 需手动粘贴',selected:'已选',more:'更多'}};
const rawTTY=(input,ui)=>!!input.isTTY&&ui.tty&&!ui.dumb&&typeof input.setRawMode==='function';
const cancelled=key=>key.ctrl&&['c','d'].includes(key.name)||key.name==='escape';
const shortPath=(file,home)=>home&&(file===home||file.startsWith(home+'/')||file.startsWith(home+'\\'))?'~'+file.slice(home.length):file;
function rawSession(input,ui,render,handle,{cursor=false}={}) {
 return new Promise(resolve=>{
  const frame=createFrame(ui),wasRaw=!!input.isRaw;let done=false;
  readline.emitKeypressEvents(input);input.setRawMode(true);input.resume();if(!cursor)ui.output.write('\x1b[?25l');
  function draw(){frame.draw(render(),{input:cursor});}
  function finish(value){if(done)return;if(value!==null)frame.draw(render(),{input:cursor});done=true;input.removeListener('keypress',onKey);input.removeListener('end',onEnd);ui.output.removeListener('resize',draw);frame.below();input.setRawMode(wasRaw);input.pause();ui.output.write('\x1b[?25h\n');resolve(value);}
  function onEnd(){finish(null);}
  function onKey(value,key={}){handle(value,key,finish);if(!done)draw();}
  input.on('keypress',onKey);input.once('end',onEnd);ui.output.on('resize',draw);draw();
 });
}
export function parseSelection(value,agents) {
 const tokens=value.trim().split(/[\s,]+/).filter(Boolean);if(!tokens.length)return null;
 const ids=tokens.map(token=>/^\d+$/.test(token)?agents[Number(token)-1]?.id:agents.find(a=>a.id===token.toLowerCase())?.id);
 if(ids.some(id=>!id))throw new Error('Invalid agent selection');return [...new Set(ids)];
}
export async function chooseAgents(agents,{input=process.stdin,output=process.stdout,language='en',onLanguage=()=>{},lines,env=process.env,step}={}) {
 let lang=language==='zh'?'zh':'en';const ui=createTerminal({output,env});
 if(!rawTTY(input,ui)) {
  const text=TEXT[lang];output.write('\n'+text.title+'\n'+agents.map((a,i)=>(i+1)+'. '+a.name+' ('+a.id+')').join('\n')+'\n'+text.policy+'\n'+text.line+'\n> ');
  const rl=lines?null:readline.createInterface({input,crlfDelay:Infinity});
  try {for await(const line of lines||rl){if(!line.trim()||/^(q|quit|cancel)$/i.test(line.trim()))return null;try{return parseSelection(line,agents);}catch{output.write(text.invalid+'\n> ');}}return null;}
  finally{rl?.close();}
 }
 let cursor=0,message='';const selected=new Set();
 function render(){
  const text=TEXT[lang],header=[...ui.heading(text.title,step),...ui.lines(`${text.selected}: ${selected.size} / ${agents.length}`,selected.size?'success':'muted'),''];
  const help=ui.height()<18?(lang==='zh'?'↑/↓ 移动 · Space · Enter · Esc · L':'↑/↓ · Space · Enter · Esc · L'):text.help;
  const footer=['',...ui.lines(help),...(ui.height()>=22?ui.lines(text.policy):[]),...(message?ui.lines(message,'error'):[])];
  const items=agents.map((a,i)=>ui.lines(`${cursor===i?'❯':' '} ${selected.has(a.id)?'[x]':'[ ]'} ${a.name}${a.manualRules?' · '+text.manual:''}`,cursor===i?'heading':selected.has(a.id)?'success':'muted'));
  const available=Math.max(1,ui.height()-header.length-footer.length-1);let start=0,end=agents.length;
  const markers=available>=3;
  const size=()=>items.slice(start,end).reduce((n,rows)=>n+rows.length,0)+(markers&&start?1:0)+(markers&&end<agents.length?1:0);
  while(size()>available&&start<cursor)start++;
  while(size()>available&&end>cursor+1)end--;
  const list=[...(markers&&start?ui.lines('↑ '+start+' '+text.more):[]),...items.slice(start,end).flat(),...(markers&&end<agents.length?ui.lines('↓ '+(agents.length-end)+' '+text.more):[])];
  return [...header,...list,...footer];
 }
 return rawSession(input,ui,render,(value,key,finish)=>{
  message='';if(cancelled(key)){finish(null);return;}
  if(key.name==='up')cursor=(cursor+agents.length-1)%agents.length;
  else if(key.name==='down')cursor=(cursor+1)%agents.length;
  else if(key.name==='space'||value===' '){const id=agents[cursor].id;selected.has(id)?selected.delete(id):selected.add(id);}
  else if(key.name==='l'){lang=lang==='en'?'zh':'en';onLanguage(lang);}
  else if(key.name==='return'||key.name==='enter'){if(!selected.size){message=TEXT[lang].empty;return;}finish(agents.filter(a=>selected.has(a.id)).map(a=>a.id));}
  else if(/^[1-8]$/.test(value||'')){const id=agents[Number(value)-1]?.id;if(id)selected.has(id)?selected.delete(id):selected.add(id);}
 });
}

const THRESHOLD_TEXT={
 en:{question:'Minimum changed files for automatic reports',help:'Default: 5. Enter keeps {current}. Type a positive integer · Esc/q cancels · L 中文',scope:'Only this task’s distinct actual changed files count. Explicit HTML requests ignore this threshold.',invalid:'Enter a positive safe integer (1 or more).'},
 zh:{question:'自动报告的最少改动文件数',help:'默认值：5。回车保留 {current}。可输入正整数 · Esc/q 取消 · L English',scope:'只统计本任务实际改动的不同文件。主动要求 HTML 不受此阈值限制。',invalid:'请输入大于等于 1 的安全整数。'}
};
export async function chooseMinChangedFiles({input=process.stdin,output=process.stdout,language='en',current=DEFAULT_MIN_CHANGED_FILES,onLanguage=()=>{},lines,env=process.env,step}={}) {
 reportPolicy(current);let lang=language==='zh'?'zh':'en';const ui=createTerminal({output,env});
 const prompt=()=>{const t=THRESHOLD_TEXT[lang];return t.question+'\n'+t.help.replace('{current}',current)+'\n'+t.scope+'\n> ';};
 if(!rawTTY(input,ui)) {
  output.write('\n'+prompt());const rl=lines?null:readline.createInterface({input,crlfDelay:Infinity});const reader=lines||rl[Symbol.asyncIterator]();
  try {while(true){const next=await reader.next();if(next.done)return null;const value=next.value.trim();if(/^(q|quit|cancel)$/i.test(value))return null;try{return value?parseMinChangedFiles(value):current;}catch{output.write(THRESHOLD_TEXT[lang].invalid+'\n> ');}}}
  finally{rl?.close();}
 }
 let value='',message='';
 const render=()=>{const t=THRESHOLD_TEXT[lang];let valid=true;if(value)try{parseMinChangedFiles(value);}catch{valid=false;}
  return [...ui.heading(t.question,step),'',...ui.lines(t.help.replace('{current}',current),'strong'),...ui.lines(t.scope),'',...(message?ui.lines(message,'error'):[]),ui.paint('  ❯ '+tailText(value,ui.width()-4),valid?'accent':'error')];};
 return rawSession(input,ui,render,(text,key,finish)=>{
  if(cancelled(key)||key.name==='q'){finish(null);return;}
  if(key.name==='l'){lang=lang==='en'?'zh':'en';onLanguage(lang);message='';return;}
  if(key.name==='return'||key.name==='enter'){try{const result=value?parseMinChangedFiles(value):current;value=String(result);finish(result);}catch{message=THRESHOLD_TEXT[lang].invalid;}return;}
  message='';if(key.name==='backspace')value=value.slice(0,-1);else if(text&&!key.ctrl&&!key.meta)value+=text;
 },{cursor:true});
}
export async function chooseConfiguration(agents,options={}) {
 const input=options.input||process.stdin,output=options.output||process.stdout,env=options.env||process.env,ui=createTerminal({output,env});
 const rl=!rawTTY(input,ui)?readline.createInterface({input,crlfDelay:Infinity}):null;
 const lines=rl?.[Symbol.asyncIterator]();let language=options.language||'en';const legacy=options.legacy||[],total=legacy.length?3:2;
 const onLanguage=value=>{language=value;options.onLanguage?.(value);};
 if(rawTTY(input,ui)){ui.write('\nAsk · Report · HTML','heading');ui.write(language==='zh'?'本地配置 · 确认前不写入文件':'Local setup · no writes before confirmation');ui.write('');}
 try {
  const minChangedFiles=await chooseMinChangedFiles({...options,input,output,lines,env,onLanguage,step:{index:1,total}});
  if(minChangedFiles===null)return null;
  const removeLegacy=await chooseLegacyRemoval(legacy,{...options,input,output,lines,env,language,onLanguage,step:{index:2,total}});
  if(removeLegacy===null)return null;
  const ids=await chooseAgents(agents,{input,output,lines,env,language,onLanguage,step:{index:total,total}});
  return ids?{agents:ids,minChangedFiles,...(legacy.length?{removeLegacy}:{})}:null;
 } finally{rl?.close();}
}

const LEGACY_TTY_TEXT={
 en:{reason:'Overlapping skills can cause duplicate reports or conflicting report thresholds. Keep the old skill if you need its features.',scope:['Only these global entries; other agents may use them.','Back up and remove only after successful installation.','Keep link targets, report history and old global rules. Check old rules manually.']},
 zh:{reason:'两份 skill 功能重叠，可能重复生成报告或使用不同门槛。仍需旧版功能可保留。',scope:['只处理列出的全局入口，其他 agents 也可能使用它们。','安装成功后才备份并清理。','保留链接目标、历史报告和旧全局规范，旧规范需手动检查。']}
};
export async function chooseLegacyRemoval(legacy,{input=process.stdin,output=process.stdout,language='en',onLanguage=()=>{},lines,env=process.env,home,step}={}) {
 if(!legacy.length)return false;let lang=language==='zh'?'zh':'en';const ui=createTerminal({output,env});
 const plainPrompt=()=>output.write('\n'+translate(lang,'legacyTitle')+'\n'+translate(lang,'legacyReason')+'\n'+legacy.map(e=>'  '+e.path+(e.removable?'':' — '+localizeError(e.error,lang))).join('\n')+'\n'+translate(lang,'legacyScope')+'\n'+translate(lang,'legacyPrompt')+'\n> ');
 if(!rawTTY(input,ui)) {
  plainPrompt();const rl=lines?null:readline.createInterface({input,crlfDelay:Infinity});const reader=lines||rl[Symbol.asyncIterator]();
  try {while(true){const next=await reader.next();if(next.done)return null;const value=next.value.trim();if(/^(q|quit|cancel)$/i.test(value))return null;if(!value||/^n(o)?$/i.test(value))return false;if(/^y(es)?$/i.test(value))return true;output.write(translate(lang,'legacyInvalid')+'\n> ');}}
  finally{rl?.close();}
 }
 let message='',answer='';
 const choices=()=>{const labels=lang==='zh'?['Y 删除','N 保留（默认）']:['Y = remove','N = keep (default)'];return displayWidth(labels.join(' · '))+2<=ui.width()?[ui.paint('  '+labels[0],'warning')+ui.paint(' · ','muted')+ui.paint(labels[1],'success')]:[...ui.lines(labels[0],'warning'),...ui.lines(labels[1],'success')];};
 const render=()=>[...ui.heading(translate(lang,'legacyTitle'),step),'',...ui.lines(LEGACY_TTY_TEXT[lang].reason,'warning'),'',...legacy.flatMap(e=>[...ui.lines(shortPath(e.path,home),'accent','    '),...(e.error?ui.lines(localizeError(e.error,lang),'error','    '):[])]),'',...LEGACY_TTY_TEXT[lang].scope.flatMap(line=>ui.lines(line)),'',...choices(),...ui.lines(lang==='zh'?'回车保留 · Esc/q 取消 · L English':'Enter keeps · Esc/q cancels · L 中文'),...(message?ui.lines(message,'error'):[]),ui.paint('  ❯ '+answer,answer==='Y'?'warning':answer==='N'?'success':'accent')];
 return rawSession(input,ui,render,(value,key,finish)=>{
  if(cancelled(key)||key.name==='q'){finish(null);return;}
  if(key.name==='l'){lang=lang==='en'?'zh':'en';onLanguage(lang);message='';return;}
  if(/^y$/i.test(value||'')){answer='Y';finish(true);return;}
  if(/^n$/i.test(value||'')||key.name==='return'||key.name==='enter'){answer='N';finish(false);return;}
  message=translate(lang,'legacyInvalid');
 },{cursor:true});
}
