import fs from 'node:fs/promises';
import path from 'node:path';
import { unzipSync } from 'fflate';
import { sha } from './files.mjs';
export async function loadBundle(root) {
  const zip = await fs.readFile(path.join(root,'assets/ask-report-html-skill.zip'));
  const manifest = JSON.parse(await fs.readFile(path.join(root,'assets/skill-manifest.json'),'utf8'));
  if (sha(zip) !== manifest.archiveSha256) throw new Error('skill 压缩包校验失败，请重新获取完整项目。');
  const files = {};
  for (const [name,data] of Object.entries(unzipSync(zip))) {
    if (!name.startsWith('ask-report-html/') || name.includes('\\') || name.includes('\0') ||
        name.split('/').some(p=>p === '..' || p === '.') || name.endsWith('/')) throw new Error('非法压缩包路径：' + name);
    const rel = name.slice('ask-report-html/'.length);
    if (!rel || data.length > 2 * 1024 * 1024 || sha(data) !== manifest.files[rel]) throw new Error('skill 文件校验失败：' + name);
    files[rel] = Buffer.from(data);
  }
  if (Object.keys(files).length !== Object.keys(manifest.files).length || !files['SKILL.md']) throw new Error('skill 压缩包不完整。');
  return {files,treeHash:manifest.treeHash,rule:files['references/agent-rule.md'].toString('utf8'),version:manifest.version};
}
