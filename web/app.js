import {translate,normalizeLanguage,localizeError} from './i18n.js';
const $=id=>document.getElementById(id);
const token=document.querySelector('meta[name=ask-report-html-token]').content;
const selected=new Set();
let state,plan,lastResult,busy=false,previewLoading=false,reportMode=false,requestNumber=0,toastTimer;
let language='en';
try{language=normalizeLanguage(localStorage.getItem('ask-report-html-language'));}catch{}
const tr=(key,values={})=>translate(language,key,values);
const countValues=()=>({count:selected.size,s:selected.size===1?'':'s'});
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const actionKey={create:'createRule',append:'appendRule',replace:'replaceRule',unchanged:'skipRule',manual:'manualRule'};
const shortPath=file=>file&&state?.home&&(file===state.home||file.startsWith(state.home+'/')||file.startsWith(state.home+'\\'))?'~'+file.slice(state.home.length):file;
const err=message=>localizeError(message,language);
function notify(message){$('toast').textContent=message;$('toast').classList.remove('hidden');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.add('hidden'),6500);}
async function api(route,data){
 const response=await fetch('/api/'+route,{method:data?'POST':'GET',headers:{'x-ask-report-html-token':token,...(data?{'Content-Type':'application/json'}:{})},...(data?{body:JSON.stringify(data)}:{})});
 const value=await response.json();if(!response.ok)throw new Error(value.error||response.statusText);return value;
}
function agentNote(agent){return tr(agent.id==='cursor'?'noteCursor':agent.id==='antigravity'?'noteAntigravity':agent.id==='opencode'&&!agent.sharedSkills?'noteOpenDisabled':['pi','codex'].includes(agent.id)?'noteOverride':'noteDefault');}
function refreshNote(agent){return tr(agent.id==='pi'?'refreshPi':'refreshOther');}
function showAgents(){
 if(!state)return;
 $('agent-grid').innerHTML=state.agents.map(agent=>`<label class="agent-card"><input type="checkbox" value="${escape(agent.id)}" aria-label="${escape(tr('selectAgent',{name:agent.name}))}" ${selected.has(agent.id)?'checked':''}><div class="agent-top"><span class="agent-monogram" aria-hidden="true">${escape(agent.short)}</span><span><span class="agent-name">${escape(agent.name)}</span><span class="agent-capability">${escape(tr(agent.manualRules?'manualCapability':agent.sharedSkills?'native':'dedicated'))}</span></span></div><code class="agent-path" title="${escape(agent.rulesPath||tr('manualPath'))}">${escape(shortPath(agent.rulesPath)||tr('manualPath'))}</code><p class="agent-status ${agent.error?'conflict':agent.action==='unchanged'?'ready':''}">${escape(tr(agent.error?'conflictStatus':agent.action==='unchanged'?'currentStatus':agent.manualRules?'manualStatus':'readyStatus'))}</p></label>`).join('');
 $('agent-grid').setAttribute('aria-busy','false');
 document.querySelectorAll('.agent-card input').forEach(input=>input.addEventListener('change',()=>{input.checked?selected.add(input.value):selected.delete(input.value);updatePlan();}));
}
function showLegacy(){
 const entries=state?.legacy||[];$('legacy-section').classList.toggle('hidden',!entries.length);
 $('legacy-paths').innerHTML=entries.map(e=>'<li><code>'+escape(shortPath(e.path))+'</code>'+(e.error?'<p class="error-text">'+escape(err(e.error))+'</p>':'')+'</li>').join('');
}
function minimumValue(){const value=$('min-changed-files').value;return /^\d+$/.test(value)&&Number.isSafeInteger(Number(value))&&Number(value)>=1?Number(value):null;}
function thresholdFeedback(){const invalid=minimumValue()===null;$('min-changed-files').setAttribute('aria-invalid',String(invalid));$('threshold-error').textContent=invalid?tr('thresholdInvalid'):'';}
function syncButton(){
 $('selected-count').textContent=tr('agentCount',countValues());
 $('install').disabled=busy||previewLoading||!plan?.canInstall||!selected.size;
 $('install').setAttribute('aria-busy',String(busy||previewLoading));
 $('install').textContent=tr(busy?'installing':previewLoading?'previewLoading':selected.size?'install':'selectBeforeInstall',countValues());
 $('select-all').textContent=tr(state&&selected.size===state.agents.length?'selectNone':'selectAll');$('select-all').disabled=busy;
 document.querySelectorAll('.agent-card input').forEach(input=>input.disabled=busy);$('min-changed-files').disabled=busy;$('remove-legacy').disabled=busy;
}
function renderPlan(){
 if(state)$('rule-preview').textContent=plan?.rule||state.rule;
 thresholdFeedback();
 if(!plan){$('plan-preview').innerHTML='<div class="empty-preview"><span class="empty-symbol" aria-hidden="true">＋</span><p>'+escape(tr('chooseFirst'))+'</p></div>';$('plan-status').textContent=tr(previewLoading?'previewLoading':'waiting');syncButton();return;}
 $('plan-preview').innerHTML=`<div class="plan-item"><header>${escape(tr('sharedSkill'))}<span class="badge">${escape(tr(plan.canonicalAction==='overwrite'?'overwriteSkill':'extractSkill'))}</span></header><code>${escape(shortPath(plan.canonicalPath))}</code><p>${escape(tr('thresholdSummary',{count:plan.policy.minChangedFiles}))}</p></div>`+plan.agents.map(agent=>`<div class="plan-item"><header>${escape(agent.name)}<span class="badge ${agent.error?'error':agent.manualRules?'warn':'ok'}">${escape(tr(agent.error?'conflict':actionKey[agent.action]))}</span></header><code>${escape(shortPath(agent.rulesPath)||tr('manualPath'))}</code>${agent.actualTarget&&agent.actualTarget!==agent.rulesPath?'<p>'+escape(tr('actualTarget'))+'</p><code>'+escape(shortPath(agent.actualTarget))+'</code>':''}${agent.links.map(link=>'<p>'+escape(tr(link.kind==='missing'?'createLink':link.kind==='overwrite'?'replaceLink':'keepLink'))+'</p><code>'+escape(shortPath(link.path))+'</code>').join('')}<p>${escape(agentNote(agent))}</p>${agent.error?'<p class="error-text">'+escape(err(agent.error))+'</p>':''}</div>`).join('');
 if(plan.legacy.length)$('plan-preview').innerHTML+='<div class="plan-item"><header>'+escape(tr('legacyResultTitle'))+'</header><p>'+escape(tr(plan.removeLegacy?'legacyRemoveSummary':'legacyKeepSummary'))+'</p>'+plan.legacy.map(e=>'<code>'+escape(shortPath(e.path))+'</code>').join('')+'</div>';
 $('plan-status').textContent=tr(plan.canInstall?'previewReady':'blocked');syncButton();
}
async function updatePlan(){
 const sequence=++requestNumber;plan=null;previewLoading=!!selected.size;renderPlan();
 if(!selected.size)return;
 const minimum=minimumValue();if(minimum===null){previewLoading=false;$('plan-status').textContent=tr('thresholdInvalid');syncButton();return;}
 try{const next=await api('plan',{agents:[...selected],policy:{minChangedFiles:minimum},removeLegacy:$('remove-legacy').checked});if(sequence!==requestNumber)return;plan=next;}
 catch(error){if(sequence!==requestNumber)return;notify(err(error.message));$('plan-status').textContent=err(error.message);}
 if(sequence!==requestNumber)return;previewLoading=false;if(plan)renderPlan();else syncButton();
}
function renderResult(scroll=false){
 if(!lastResult){$('result-title').textContent=tr('resultTitle');return;}
 const result=lastResult;
 $('result-threshold').textContent=tr('thresholdSummary',{count:result.policy.minChangedFiles});
 $('activation-reminder').classList.toggle('hidden',!result.results.some(item=>item.status!=='error'));
 $('result-title').textContent=tr(result.status==='partial'?'partialTitle':result.results.some(item=>item.status==='manual-required')?'manualTitle':'completedTitle');
 $('skill-backup').classList.toggle('hidden',!result.canonicalBackup);$('skill-backup').textContent=result.canonicalBackup?tr('skillBackup')+' '+result.canonicalBackup:'';
 $('results').innerHTML=result.results.map(item=>`<article class="result-row"><div class="result-heading"><strong>${escape(item.name)}</strong><span class="badge ${item.status==='error'?'error':item.status==='manual-required'?'warn':'ok'}">${escape(tr(item.status==='error'?'notComplete':item.status==='manual-required'?'rulesPending':'complete'))}</span></div>${item.rulesPath?'<code>'+escape(item.rulesPath)+'</code>':''}${item.backup?'<p>'+escape(tr('originalBackup'))+'</p><code>'+escape(item.backup)+'</code>':''}${item.links.map(link=>'<p>'+escape(tr('method',{kind:link.kind}))+'</p><code>'+escape(link.path)+'</code>'+(link.backup?'<p>'+escape(tr('dedicatedBackup'))+'</p><code>'+escape(link.backup)+'</code>':'')).join('')}${item.error?'<p class="error-text">'+escape(err(item.error))+'</p>':'<p>'+escape(refreshNote(item))+'</p>'}</article>`).join('');
 $('legacy-results').innerHTML=result.legacy.length?'<h3>'+escape(tr('legacyResultTitle'))+'</h3>'+result.legacy.map(item=>'<article class="result-row"><div class="result-heading"><strong>'+escape(tr(item.status==='removed'?'legacyRemoved':item.status==='kept'?'legacyKept':'legacyFailed'))+'</strong></div><code>'+escape(item.path)+'</code>'+(item.backup?'<p>'+escape(tr('legacyBackup'))+'</p><code>'+escape(item.backup)+'</code>':'')+(item.error?'<p class="error-text">'+escape(err(item.error))+'</p>':'')+(item.reason?'<p>'+escape(tr('legacyInstallIncomplete'))+'</p>':'')+'</article>').join(''):'';
 $('result-section').classList.remove('hidden');$('cursor-guide').classList.toggle('hidden',!result.results.some(item=>item.id==='cursor'&&item.status==='manual-required'));
 if(scroll)$('result-section').scrollIntoView({block:'start',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});
}
async function refresh(){state=await api('state');$('remove-legacy').checked=false;showLegacy();$('min-changed-files').value=state.policy.minChangedFiles;$('environment').textContent=({darwin:'macOS',win32:'Windows',linux:'Linux'}[state.platform]||state.platform)+' · '+state.version;$('rule-preview').textContent=state.rule;showAgents();await updatePlan();}
function showMode(){
 $('mode-answer').setAttribute('aria-pressed',String(!reportMode));$('mode-report').setAttribute('aria-pressed',String(reportMode));$('sample-filename').textContent=reportMode?'report.html':'answer.html';
 $('sample-kicker').textContent=tr(reportMode?'reportKicker':'answerKicker');$('sample-title').textContent=tr(reportMode?'reportTitle':'answerTitle');$('sample-description').textContent=tr(reportMode?'reportDescription':'answerDescription');
 ['one','two','three'].forEach((key,index)=>$('sample-section-'+key).textContent=tr((reportMode?['changes','validation','next']:['conclusion','relationships','comparison'])[index]));
}
function themeLabel(){const dark=document.documentElement.dataset.theme==='dark';$('theme').textContent=tr(dark?'light':'dark');$('theme').setAttribute('aria-label',tr(dark?'switchLight':'switchDark'));}
function confirmationText(){$('confirm-summary').textContent=tr('confirmSummary',{...countValues(),minimum:plan?.policy.minChangedFiles??minimumValue(),skillAction:tr(plan?.canonicalAction==='overwrite'?'confirmOverwrite':'confirmExtract'),manualNote:selected.has('cursor')?tr('confirmManual'):''});$('confirm-legacy').classList.toggle('hidden',!plan?.legacy.length);$('confirm-legacy').textContent=plan?.legacy.length?tr(plan.removeLegacy?'legacyRemoveSummary':'legacyKeepSummary')+'\n'+plan.legacy.map(e=>shortPath(e.path)).join('\n'):'';}
function setLanguage(value){
 language=normalizeLanguage(value);document.documentElement.lang=language==='zh'?'zh-CN':'en';document.title=tr('title');
 document.querySelectorAll('[data-i18n]').forEach(element=>element.textContent=tr(element.dataset.i18n));
 document.querySelectorAll('[data-i18n-aria]').forEach(element=>element.setAttribute('aria-label',tr(element.dataset.i18nAria)));
 $('language').textContent=language==='en'?'中文':'English';$('language').setAttribute('aria-label',tr('switchLanguage'));
 try{localStorage.setItem('ask-report-html-language',language);}catch{}
 if(state)$('environment').textContent=({darwin:'macOS',win32:'Windows',linux:'Linux'}[state.platform]||state.platform)+' · '+state.version;
 showMode();themeLabel();showAgents();showLegacy();renderPlan();renderResult();confirmationText();
}
function setTheme(value){const theme=value==='light'?'light':'dark';document.documentElement.dataset.theme=theme;themeLabel();try{localStorage.setItem('ask-report-html-theme',theme);}catch{}}
$('remove-legacy').addEventListener('change',()=>updatePlan());
$('min-changed-files').addEventListener('input',()=>updatePlan());
$('select-all').addEventListener('click',()=>{if(selected.size===state.agents.length)selected.clear();else state.agents.forEach(agent=>selected.add(agent.id));showAgents();updatePlan();});
$('install').addEventListener('click',()=>{if(!plan?.canInstall||busy)return;confirmationText();$('confirm-dialog').showModal();});
$('cancel-install').addEventListener('click',()=>$('confirm-dialog').close());
$('confirm-install').addEventListener('click',async()=>{
 if(busy||!plan)return;busy=true;$('confirm-dialog').close();syncButton();
 try{lastResult=await api('install',{planId:plan.planId});renderResult(true);notify(tr(lastResult.status==='partial'?'partialToast':'installRecorded'));}
 catch(error){notify(err(error.message));$('plan-status').textContent=err(error.message);}
 finally{busy=false;await refresh().catch(error=>notify(err(error.message)));syncButton();}
});
$('refresh').addEventListener('click',()=>refresh().then(()=>notify(tr('refreshed'))).catch(error=>notify(err(error.message))));
$('copy-rules').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(lastResult?.rule||state.rule);notify(tr('copied'));}catch{notify(tr('copyDenied'));$('rule-preview').closest('details').open=true;}});
$('language').addEventListener('click',()=>setLanguage(language==='en'?'zh':'en'));
$('theme').addEventListener('click',()=>setTheme(document.documentElement.dataset.theme==='dark'?'light':'dark'));
$('mode-answer').addEventListener('click',()=>{reportMode=false;showMode();});$('mode-report').addEventListener('click',()=>{reportMode=true;showMode();});
try{setTheme(localStorage.getItem('ask-report-html-theme')||'dark');}catch{setTheme('dark');}
setLanguage(language);refresh().catch(error=>{notify(err(error.message));$('environment').textContent=tr('loadFailed');$('plan-status').textContent=err(error.message);});
