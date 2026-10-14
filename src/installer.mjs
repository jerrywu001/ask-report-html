import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {detectLegacy,removeLegacyEntry} from './legacy.mjs';
import { catalog } from './catalog.mjs';
import {readReportPolicy,reportPolicy,withReportPolicy,DEFAULT_MIN_CHANGED_FILES} from './report-policy.mjs';
import { sha,treeHash,ruleFile,updateRule,backup,atomicWrite,linkState,createDirectoryLink,pathSnapshot,replaceSkillEntry,MARKER } from './files.mjs';

export class Installer {
  constructor({home,env={},platform=process.platform,bundle,linkOptions={}}) {
    Object.assign(this,{home,env,platform,bundle,linkOptions});
    this.plans = new Map(); this.busy = false;
  }
  async canonicalState(file) {
    const snapshot=await pathSnapshot(file);
    return snapshot.kind==='missing'?snapshot:{...snapshot,kind:'overwrite',previousKind:snapshot.kind};
  }
  async policy() {
    const registry=await catalog(this);
    return readReportPolicy(registry.canonical);
  }
  async legacy() {return detectLegacy((await catalog(this)).legacyPaths);}
  async prepare(ids,settings,removeLegacy=false) {
    if(typeof removeLegacy!=='boolean')throw new Error('旧 skill 删除选项必须是布尔值。');
    const registry = await catalog(this);
    const legacy=await detectLegacy(registry.legacyPaths);
    const policy=settings===undefined?await this.policy():reportPolicy(settings?.minChangedFiles??null);
    const bundle=withReportPolicy(this.bundle,policy);
    if (!Array.isArray(ids) || ids.length < 1 || ids.length > 8 ||
        new Set(ids).size !== ids.length || ids.some(id=>typeof id !== 'string' || !registry.agents.some(a=>a.id===id)))
      throw new Error('请选择有效且不重复的 agent。');
    let canonical,canonicalError;
    try { canonical = await this.canonicalState(registry.canonical); }
    catch (e) { canonicalError=e.message; canonical={kind:'conflict',fingerprint:e.message}; }
    const agents=[];
    for (const agent of registry.agents.filter(a=>ids.includes(a.id))) {
      const row={...agent,links:[],error:canonicalError || null,action:agent.manualRules?'manual':'create'};
      try {
        if (agent.rulesPath) {
          const file=await ruleFile(agent.rulesPath);
          const update=updateRule(file.content,bundle.rule);
          row.action=update.action;
          row.ruleFingerprint=file.fingerprint;
          row.actualTarget=file.target;
          row.willBackup=file.exists && row.action!=='unchanged';
        }
        for (const target of agent.links) row.links.push({path:target,...await linkState(target,registry.canonical,bundle.treeHash)});
      } catch(e) { row.error=e.message; }
      agents.push(row);
    }
    const revision=sha(JSON.stringify({canonical,policy,removeLegacy,...(removeLegacy?{legacy}:{}),agents:agents.map(a=>({id:a.id,fp:a.ruleFingerprint,links:a.links,error:a.error,action:a.action}))}));
    return {canonicalPath:registry.canonical,canonicalAction:canonical.kind,canonicalFingerprint:canonical.fingerprint,agents,revision,canInstall:agents.every(a=>!a.error),policy,defaultMinChangedFiles:DEFAULT_MIN_CHANGED_FILES,rule:bundle.rule,legacy,removeLegacy};
  }
  async state() {
    const registry=await catalog(this);
    const plan=await this.prepare(registry.agents.map(a=>a.id));
    return {home:registry.home,platform:this.platform,version:this.bundle.version,...plan};
  }
  async preview(ids,settings,removeLegacy=false) {
    for (const [key,value] of this.plans) if (value.expires<Date.now()) this.plans.delete(key);
    if (this.plans.size>=100) this.plans.delete(this.plans.keys().next().value);
    const plan=await this.prepare(ids,settings,removeLegacy);
    const planId=crypto.randomUUID();
    this.plans.set(planId,{ids:[...ids],policy:plan.policy,removeLegacy:plan.removeLegacy,revision:plan.revision,expires:Date.now()+300000});
    return {...plan,planId};
  }
  async extractCanonical(destination,expectedFingerprint,bundle) {
    return replaceSkillEntry(destination,{expectedFingerprint,backupRoot:path.join(this.home,'.ask-report-html/backups'),build:async temp=>{
      await fs.mkdir(temp,{recursive:true});
      for(const [rel,bytes] of Object.entries(bundle.files)) {
        const file=path.join(temp,rel);await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,bytes,{flag:'wx',mode:0o644});
      }
      if(await treeHash(temp)!==bundle.treeHash)throw new Error('解压后 skill 指纹不一致。');
      return 'directory';
    }});
  }
  async install(planId) {
    if (this.busy) throw new Error('另一次安装正在运行，请稍后重试。');
    const saved=this.plans.get(planId);
    if (!saved || saved.expires<Date.now()) throw new Error('预览已过期，请重新预览。');
    this.plans.delete(planId);
    this.busy=true;
    try {
      const plan=await this.prepare(saved.ids,saved.policy,saved.removeLegacy);
      const bundle=withReportPolicy(this.bundle,plan.policy);
      if (plan.revision!==saved.revision) throw new Error('配置在预览后发生变化，未写入；请重新预览。');
      if (!plan.canInstall) throw new Error('存在路径冲突，请先处理后再安装。');
      const canonicalResult=await this.extractCanonical(plan.canonicalPath,plan.canonicalFingerprint,bundle);
      const results=[];
      for (const agent of plan.agents) {
        const result={id:agent.id,name:agent.name,links:[],status:'installed',backup:null,rulesPath:agent.rulesPath,refresh:agent.refresh};
        try {
          for (const link of agent.links) {
            const fresh=await linkState(link.path,plan.canonicalPath,bundle.treeHash);
            if (fresh.fingerprint!==link.fingerprint) throw new Error('链接目标在安装期间变化，未覆盖。');
            let kind=fresh.kind,linkBackup=null;
            if(fresh.kind!=='linked') {
              const replacement=await replaceSkillEntry(link.path,{expectedFingerprint:fresh.fingerprint,backupRoot:path.join(this.home,'.ask-report-html/backups'),build:async stage=>{
                const created=await createDirectoryLink(plan.canonicalPath,stage,{platform:this.platform,...this.linkOptions});
                if(created==='managed-copy') {
                  const file=path.join(stage,MARKER),marker=JSON.parse(await fs.readFile(file,'utf8'));marker.copyPath=path.resolve(link.path);await fs.writeFile(file,JSON.stringify(marker,null,2));
                }
                return created;
              }});
              kind=replacement.value;linkBackup=replacement.backup;
            }
            result.links.push({path:link.path,kind,backup:linkBackup});
          }
          if (agent.rulesPath) {
            const current=await ruleFile(agent.rulesPath);
            if (current.fingerprint!==agent.ruleFingerprint) throw new Error('规范文件在安装期间变化，未覆盖。');
            const update=updateRule(current.content,bundle.rule);
            if(update.action!=='unchanged') {
              if (current.exists) result.backup=await backup(current.target,path.join(this.home,'.ask-report-html/backups'));
              await atomicWrite(current.target,update.content,current.mode);
              result.ruleAction=update.action==='replace'?'replaced':update.action==='append'?'appended':'created';
            } else result.ruleAction='unchanged';
          } else {result.status='manual-required';result.ruleAction='copy-to-cursor-settings';}
        } catch(e) {result.status='error';result.error=e.message;}
        results.push(result);
      }
      const installFailed=results.some(r=>r.status==='error'),legacy=[];
      // Do not remove a working fallback when the replacement installation failed.
      for(const entry of plan.legacy) {
        if(!plan.removeLegacy||installFailed)legacy.push({path:entry.path,status:'kept',reason:installFailed&&plan.removeLegacy?'installation-incomplete':null});
        else if(!entry.removable)legacy.push({path:entry.path,status:'manual-required',error:entry.error});
        else try{legacy.push(await removeLegacyEntry(entry,path.join(this.home,'.ask-report-html/backups')));}
        catch(error){legacy.push({path:entry.path,status:'error',error:error.message});}
      }
      return {status:installFailed||legacy.some(r=>['error','manual-required'].includes(r.status))?'partial':'completed',canonicalPath:plan.canonicalPath,canonicalBackup:canonicalResult.backup,skillAction:canonicalResult.action,results,policy:plan.policy,rule:bundle.rule,legacy,removeLegacy:plan.removeLegacy};
    } finally {this.busy=false;}
  }
}
