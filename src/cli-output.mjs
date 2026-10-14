import {createTerminal} from './terminal.mjs';
import {translate,localizeError} from '../web/i18n.js';

export function createCLIOutput({output=process.stdout,env=process.env,language='en',home}={}) {
 const ui=createTerminal({output,env}),tr=(key,values)=>translate(language,key,values);
 const path=file=>ui.tty&&home&&(file===home||file.startsWith(home+'/')||file.startsWith(home+'\\'))?'~'+file.slice(home.length):file;
 const detail=(label,file,tone='muted')=>{ui.write(label,tone,'  ');ui.write(path(file),tone,'    ');};
 function legacy(plan,{interactive=false}={}) {
  if(!plan.legacy.length)return;
  if(!interactive){ui.write(tr('legacyTitle'),'warning');ui.write(tr('legacyReason'));for(const entry of plan.legacy){ui.write(path(entry.path),'accent','  ');if(entry.error)ui.write(localizeError(entry.error,language),'error','    ');}ui.write(tr('legacyScope'));}
  ui.write(tr(plan.removeLegacy?'legacyRemoveSummary':'legacyKeepSummary'),plan.removeLegacy?'warning':'muted');
 }
 function result(value) {
  const partial=value.status==='partial',manual=value.results.some(r=>r.status==='manual-required');
  const title=language==='zh'?(partial?'部分安装完成，请检查失败项':manual?'skill 已安装，Cursor 规范待粘贴':'安装完成'):(partial?'Installation partially completed':manual?'Skill installed; Cursor rules still need pasting':'Installation complete');
  ui.write('');ui.write((partial||manual?'! ':'✓ ')+title,partial||manual?'warning':'success');
  ui.write('Shared skill: '+path(value.canonicalPath)+' ('+value.skillAction+')','accent');ui.write(tr('thresholdTitle'),'strong');ui.write(tr('thresholdSummary',{count:value.policy.minChangedFiles}));
  if(value.canonicalBackup)detail('Skill backup:',value.canonicalBackup,'warning');
  for(const agent of value.results) {
   ui.write('');ui.write((agent.status==='error'?'✗ ':agent.status==='manual-required'?'! ':'✓ ')+agent.name+': '+agent.status+(agent.ruleAction?' / '+agent.ruleAction:''),agent.status==='error'?'error':agent.status==='manual-required'?'warning':'success');
   if(agent.error)ui.write(localizeError(agent.error,language),'error','  ');
   if(agent.rulesPath)detail('Rules:',agent.rulesPath);if(agent.backup)detail('Backup:',agent.backup,'warning');
   for(const link of agent.links){detail(link.kind+':',link.path);if(link.backup)detail('Previous skill backup:',link.backup,'warning');}
   if(agent.status!=='error')ui.write(tr(agent.id==='pi'?'refreshPi':'refreshOther'),'accent','  ');
  }
  for(const item of value.legacy) {
   ui.write('');ui.write(tr(item.status==='removed'?'legacyRemoved':item.status==='kept'?'legacyKept':'legacyFailed')+': '+path(item.path),item.status==='removed'?'success':item.status==='kept'?'muted':'error');
   if(item.backup)detail(tr('legacyBackup'),item.backup,'warning');if(item.error)ui.write(localizeError(item.error,language),'error','  ');if(item.reason)ui.write(tr('legacyInstallIncomplete'),'warning','  ');
  }
  if(value.results.some(r=>r.status==='manual-required')){ui.write('\nCursor: append this in Settings → Rules → User Rules:','warning');ui.write(value.rule,'muted');}
 }
 function preview(plan) {
  ui.write('Preview only — no files changed.','heading');detail('Shared skill:',plan.canonicalPath);ui.write(tr('thresholdTitle'),'strong');ui.write(tr('thresholdSummary',{count:plan.policy.minChangedFiles}));
  for(const agent of plan.agents){ui.write(agent.name+': '+agent.action+' → '+path(agent.rulesPath||'Cursor Settings / User Rules'),'accent');for(const link of agent.links)detail('Link:',link.path);}
  ui.write('\nRun the same command with --yes to install. Cursor rules remain a manual official-settings step.');
 }
 return {ui,legacy,result,preview};
}
