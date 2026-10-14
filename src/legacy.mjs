import fs from 'node:fs/promises';
import path from 'node:path';
import {pathSnapshot,backupEntry} from './files.mjs';

export const LEGACY_NAME='answer-me-with-html';
async function parentState(file) {
  let dir=path.dirname(file);const records=[];
  while(true) {
    const stat=await fs.lstat(dir);
    if(stat.isSymbolicLink()||!stat.isDirectory())throw new Error('旧 skill 的父目录含链接或不是目录，请手动处理：'+file);
    records.push([dir,stat.dev,stat.ino]);
    const parent=path.dirname(dir);if(parent===dir)break;dir=parent;
  }
  return JSON.stringify(records);
}
export async function inspectLegacy(file) {
  try {
    const stat=await fs.lstat(file);
    if(!stat.isDirectory()&&!stat.isSymbolicLink())throw new Error('旧 skill 不是目录或目录链接，请手动处理：'+file);
    const parentFingerprint=await parentState(file),entry=await pathSnapshot(file);
    return {path:file,...entry,parentFingerprint,removable:true};
  } catch(error) {if(['ENOENT','ENOTDIR'].includes(error.code))return null;return {path:file,kind:'conflict',fingerprint:error.message,removable:false,error:error.message};}
}
export async function detectLegacy(paths) {
  return (await Promise.all(paths.map(inspectLegacy))).filter(Boolean);
}
export async function removeLegacyEntry(entry,backupRoot,{rename=fs.rename,unlink=fs.unlink}={}) {
  const matches=current=>current?.removable&&current.fingerprint===entry.fingerprint&&current.parentFingerprint===entry.parentFingerprint;
  if(!matches(await inspectLegacy(entry.path)))throw new Error('旧 skill 在预览后发生变化，未删除：'+entry.path);
  const backup=await backupEntry(entry.path,backupRoot,entry.fingerprint);
  if(!matches(await inspectLegacy(entry.path)))throw new Error('旧 skill 在备份期间变化，未删除：'+entry.path);
  if(entry.kind==='link') {
    // Unlink only the entry. A broken link is safe too; never touch its target.
    await unlink(entry.path);
    return {path:entry.path,status:'removed',backup};
  }
  // Move the original into the verified backup folder rather than recursively
  // destroying it. A cross-device/permission failure leaves the skill intact.
  const original=path.join(path.dirname(backup),'original-entry');
  await rename(entry.path,original);
  return {path:entry.path,status:'removed',backup,original};
}
