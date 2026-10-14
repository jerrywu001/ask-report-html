import fs from 'node:fs/promises';
import path from 'node:path';
import {sha} from './files.mjs';

export const DEFAULT_MIN_CHANGED_FILES=5;
export const POLICY_FILE='auto-report.json';
export const POLICY_ERROR='自动报告文件数阈值必须是大于等于 1 的安全整数。';
export function reportPolicy(value=DEFAULT_MIN_CHANGED_FILES) {
  if(!Number.isSafeInteger(value)||value<1)throw new Error(POLICY_ERROR);
  return {minChangedFiles:value};
}
export function parseMinChangedFiles(text) {
  if(!/^\d+$/.test(String(text).trim()))throw new Error(POLICY_ERROR);
  return reportPolicy(Number(text)).minChangedFiles;
}
export async function readReportPolicy(skillPath) {
  try {
    const file=path.join(skillPath,POLICY_FILE),stat=await fs.lstat(file);
    if(!stat.isFile()||stat.size>4096)return reportPolicy();
    return reportPolicy(JSON.parse(await fs.readFile(file,'utf8'))?.minChangedFiles??null);
  } catch(error) {
    if(error.code==='ENOENT'||error.code==='ENOTDIR'||error instanceof SyntaxError||error.message===POLICY_ERROR)return reportPolicy();
    throw error;
  }
}
// Customize a verified base bundle without mutating it. Hash in directory-walk
// order, exactly as treeHash() does, so extraction and managed copies still verify.
export function withReportPolicy(bundle,policy) {
  const settings=reportPolicy(policy.minChangedFiles);
  const rule=bundle.rule.replace(/Automatic report minimum: \*\*\d+ changed files\*\*/,`Automatic report minimum: **${settings.minChangedFiles} changed files**`);
  if(rule===bundle.rule&&!rule.includes(`Automatic report minimum: **${settings.minChangedFiles} changed files**`))throw new Error('Skill archive is missing the automatic report policy. Rebuild it.');
  const files={...bundle.files,[POLICY_FILE]:Buffer.from(JSON.stringify(settings,null,2)+'\n'),'references/agent-rule.md':Buffer.from(rule)};
  const ordered=Object.keys(files).sort((a,b)=>{
    const aa=a.split('/'),bb=b.split('/');
    for(let i=0;i<Math.min(aa.length,bb.length);i++)if(aa[i]!==bb[i])return aa[i]<bb[i]?-1:1;
    return aa.length-bb.length;
  });
  return {...bundle,files,rule,treeHash:sha(JSON.stringify(ordered.map(rel=>[rel,sha(files[rel])])))};
}
