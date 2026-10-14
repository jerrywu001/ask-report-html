import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {messages,translate,normalizeLanguage,localizeError} from '../web/i18n.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
test('READMEs use npm-visible different-language screenshot URLs at a smaller proportional size',async()=>{
 const en=await fs.readFile(path.join(root,'README.md'),'utf8'),zh=await fs.readFile(path.join(root,'README.zh-CN.md'),'utf8');
 const images='https://raw.githubusercontent.com/jerrywu001/ask-report-html/main/docs/images/';
 assert.ok(en.includes('src="'+images+'interface-dark.png"'));assert.ok(zh.includes('src="'+images+'interface-dark-zh.png"'));assert.ok(en.includes('width="760"')&&zh.includes('width="760"'));
 const files=await Promise.all(['interface-dark.png','interface-dark-zh.png'].map(name=>fs.readFile(path.join(root,'docs/images',name))));
 for(const bytes of files){const width=bytes.readUInt32BE(16),height=bytes.readUInt32BE(20);assert.equal(width,1200);assert.equal(height,567);}
 assert.notDeepEqual(files[0],files[1]);
});
test('English is the default and both language dictionaries cover the same keys',()=>{
 assert.equal(normalizeLanguage(null),'en');assert.equal(normalizeLanguage('unknown'),'en');assert.equal(normalizeLanguage('zh'),'zh');assert.deepEqual(Object.keys(messages.en).sort(),Object.keys(messages.zh).sort());assert.equal(translate('en','agentCount',{count:1,s:''}),'1 agent');assert.equal(translate('zh','agentCount',{count:2}),'2 个 agent');
});
test('every static site translation and aria label exists in English and Chinese',async()=>{
 const html=await fs.readFile(path.join(root,'web/index.html'),'utf8');assert.ok(html.includes('<html lang="en"'));assert.ok(html.includes('id="language"'));
 for(const match of html.matchAll(/data-i18n(?:-aria)?="([^"]+)"/g))assert.ok(messages.en[match[1]]&&messages.zh[match[1]],match[1]);
});
test('threshold input, confirmation and activation instructions are bilingual',async()=>{
 const html=await fs.readFile(path.join(root,'web/index.html'),'utf8');assert.match(html,/<label for="min-changed-files"/);assert.match(html,/id="min-changed-files" type="number" min="1" step="1"/);assert.ok(html.includes('aria-describedby="threshold-help threshold-error"'));
 for(const language of ['en','zh']){
  assert.ok(translate(language,'thresholdHelp').includes('5'));assert.ok(translate(language,'thresholdSummary',{count:17}).includes('17'));assert.ok(translate(language,'confirmSummary',{count:1,minimum:17}).includes('17'));assert.ok(translate(language,'activationReminder').includes('/reload'));
 }
 for(const name of ['README.md','README.zh-CN.md']){
  const text=await fs.readFile(path.join(root,name),'utf8');assert.ok(text.includes('auto-report.json'));assert.ok(text.includes('--min-changed-files 7'));assert.ok(text.includes('/reload'));assert.ok(text.includes('1–4'));assert.ok(!text.includes('/relaod'));
 }
});
test('English errors preserve their file path and Chinese errors preserve their meaning',()=>{
 const raw='skill 在预览后发生变化，未覆盖：example/path';assert.equal(localizeError(raw,'en'),'The skill changed after preview; it was not overwritten: example/path');assert.equal(localizeError(raw,'zh'),raw);assert.equal(localizeError('EPERM: permission denied','en'),'EPERM: permission denied');
});
test('READMEs lead with upstream attribution and the same simple interactive command',async()=>{
 for(const name of ['README.md','README.zh-CN.md']){
  const text=await fs.readFile(path.join(root,name),'utf8');assert.ok(text.slice(0,450).includes('https://github.com/QingYunA/answer-me-with-html'));assert.ok(text.includes('npm run configure'));assert.ok(text.includes('README.zh-CN.md'));assert.ok(text.includes('README.md'));
 }
 const en=await fs.readFile(path.join(root,'README.md'),'utf8');const prompt=en.match(/```text\n(Please set up[\s\S]*?)\n```/)[1];assert.ok(prompt.includes('I will select the agents myself'));assert.ok(prompt.includes('Do not preselect'));assert.ok(prompt.includes('npm run configure'));assert.ok(!prompt.includes('claude,codex,pi'));
});
