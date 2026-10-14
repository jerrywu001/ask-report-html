import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

export const sha = data => crypto.createHash('sha256').update(data).digest('hex');
export const MARKER = '.ask-report-html-managed.json';
export async function lstat(file) {
  try { return await fs.lstat(file); } catch (e) { if (e.code === 'ENOENT') return null; throw e; }
}
export async function treeHash(root) {
  const entries = [];
  async function visit(dir, prefix='') {
    for (const item of (await fs.readdir(dir,{withFileTypes:true})).sort((a,b)=>a.name<b.name?-1:1)) {
      if (item.name === MARKER && !prefix) continue;
      const rel = prefix + item.name;
      const file = path.join(dir,item.name);
      if (item.isSymbolicLink()) throw new Error('拒绝扫描 skill 内部的符号链接：' + rel);
      if (item.isDirectory()) await visit(file,rel + '/');
      else if (item.isFile()) entries.push([rel,sha(await fs.readFile(file))]);
      else throw new Error('skill 中包含非普通文件：' + rel);
    }
  }
  await visit(root);
  return sha(JSON.stringify(entries));
}
export async function ruleFile(file) {
  const stat = await lstat(file);
  if (!stat) return {exists:false, target:file, content:'', fingerprint:'missing', mode:0o600};
  let target = file;
  if (stat.isSymbolicLink()) {
    try { target = await fs.realpath(file); } catch { throw new Error('全局规范链接失效：' + file); }
  }
  const resolved = await fs.stat(target);
  if (!resolved.isFile() || resolved.size > 2 * 1024 * 1024) throw new Error('全局规范必须是小于 2MB 的普通文件：' + file);
  const bytes = await fs.readFile(target);
  const content = bytes.toString('utf8');
  if (!Buffer.from(content).equals(bytes)) throw new Error('全局规范不是有效 UTF-8：' + file);
  return {exists:true,target,content,fingerprint:sha(bytes) + ':' + target,mode:resolved.mode & 0o777};
}
export async function backup(file, backupRoot) {
  const folder = path.join(backupRoot,crypto.randomUUID());
  await fs.mkdir(folder,{recursive:true,mode:0o700});
  const destination = path.join(folder,path.basename(file));
  await fs.copyFile(file,destination,fs.constants.COPYFILE_EXCL);
  await fs.chmod(destination,0o600);
  return destination;
}
export async function atomicWrite(file, content, mode=0o600) {
  await fs.mkdir(path.dirname(file),{recursive:true});
  const temp = file + '.ask-report-html-' + crypto.randomUUID() + '.tmp';
  try {
    await fs.writeFile(temp,content,{flag:'wx',mode});
    await fs.rename(temp,file);
  } finally { await fs.rm(temp,{force:true}); }
}
export {START,END,appendRule,updateRule} from './rules.mjs';

// Snapshot the entry itself, never the target of a link. Existing skills may
// contain links; replacing a skill must not traverse or remove external data.
export async function pathSnapshot(file) {
  const stat=await lstat(file);
  if(!stat)return {kind:'missing',fingerprint:'missing'};
  const records=[];
  async function visit(item,rel='') {
    const s=await fs.lstat(item);
    if(s.isSymbolicLink())records.push([rel,'link',await fs.readlink(item)]);
    else if(s.isDirectory()) {
      records.push([rel,'directory']);
      for(const name of (await fs.readdir(item)).sort())await visit(path.join(item,name),rel+'/'+name);
    } else if(s.isFile())records.push([rel,'file',sha(await fs.readFile(item))]);
    else throw new Error('同名 skill 包含不支持的文件类型：'+item);
  }
  await visit(file);
  return {kind:stat.isSymbolicLink()?'link':stat.isDirectory()?'directory':'file',fingerprint:sha(JSON.stringify(records))};
}
export async function backupEntry(file,root,expectedFingerprint) {
  const folder=path.join(root,crypto.randomUUID());
  await fs.mkdir(folder,{recursive:true,mode:0o700});
  const stat=await fs.lstat(file);
  if(stat.isSymbolicLink()) {
    const descriptor=path.join(folder,path.basename(file)+'.link.json');
    await fs.writeFile(descriptor,JSON.stringify({kind:'ask-report-html/link-backup',path:file,target:await fs.readlink(file),fingerprint:expectedFingerprint},null,2),{flag:'wx',mode:0o600});
    return descriptor;
  }
  const destination=path.join(folder,path.basename(file));
  await fs.cp(file,destination,{recursive:true,dereference:false,verbatimSymlinks:true,errorOnExist:true,force:false});
  if((await pathSnapshot(destination)).fingerprint!==expectedFingerprint)throw new Error('旧 skill 备份校验失败，原路径未修改。');
  return destination;
}
async function removeEntry(file) {
  const stat=await lstat(file);
  if(!stat)return;
  await fs.rm(file,{recursive:stat.isDirectory()||stat.isSymbolicLink(),force:true});
}
export async function replaceSkillEntry(target,{expectedFingerprint,backupRoot,build,rename=fs.rename}) {
  const stage=path.join(path.dirname(target),'.'+path.basename(target)+'.new-'+crypto.randomUUID());
  const old=path.join(path.dirname(target),'.'+path.basename(target)+'.old-'+crypto.randomUUID());
  let moved=false,published=false,backupPath=null;
  await fs.mkdir(path.dirname(target),{recursive:true});
  try {
    const value=await build(stage);
    const before=await pathSnapshot(target);
    if(before.fingerprint!==expectedFingerprint)throw new Error('skill 在预览后发生变化，未覆盖：'+target);
    if(before.kind!=='missing') {
      backupPath=await backupEntry(target,backupRoot,before.fingerprint);
      if((await pathSnapshot(target)).fingerprint!==expectedFingerprint)throw new Error('备份期间 skill 发生变化，未覆盖：'+target);
      await rename(target,old);moved=true;
    }
    try {await rename(stage,target);published=true;}
    catch(error) {
      if(moved){await rename(old,target);moved=false;}
      throw error;
    }
    if(moved){await removeEntry(old);moved=false;}
    return {backup:backupPath,value,action:before.kind==='missing'?'created':'overwritten'};
  } finally {
    await removeEntry(stage);
    // A failed rollback is deliberately retained; never delete the last copy.
    if(published&&moved)await removeEntry(old);
  }
}
export async function linkState(target,source,expectedHash) {
  const snapshot=await pathSnapshot(target);
  if(snapshot.kind==='missing')return snapshot;
  if(snapshot.kind==='link') {
    let real;try{real=await fs.realpath(target);}catch{}
    if(real===path.resolve(source))return {...snapshot,kind:'linked'};
  }
  return {...snapshot,kind:'overwrite',previousKind:snapshot.kind};
}
export async function createDirectoryLink(source,target,{platform=process.platform,symlink=fs.symlink}={}) {
  if (await lstat(target)) throw new Error('链接目标已存在：' + target);
  await fs.mkdir(path.dirname(target),{recursive:true});
  const attempts = platform === 'win32' ? ['dir','junction'] : ['dir'];
  for (const type of attempts) {
    try { await symlink(path.resolve(source),target,type); return type === 'junction' ? 'junction' : 'symlink'; }
    catch (e) {
      if (await lstat(target)) throw e;
      if (platform !== 'win32' || !['EPERM','EACCES','ENOTSUP','EINVAL','EXDEV','ENOENT','UNKNOWN'].includes(e.code)) throw e;
    }
  }
  const temp = target + '.tmp-' + crypto.randomUUID();
  try {
    const hash = await treeHash(source);
    await fs.cp(source,temp,{recursive:true,errorOnExist:true,force:false});
    const copyHash = await treeHash(temp);
    if (copyHash !== hash) throw new Error('副本指纹校验失败');
    await fs.writeFile(path.join(temp,MARKER),JSON.stringify({kind:'ask-report-html/managed-copy',original:path.resolve(source),copyPath:path.resolve(target),sourceFingerprint:hash,copyFingerprint:copyHash},null,2),{flag:'wx',mode:0o600});
    await fs.rename(temp,target);
    return 'managed-copy';
  } finally { await fs.rm(temp,{recursive:true,force:true}); }
}
