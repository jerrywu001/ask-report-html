import test from 'node:test';
import assert from 'node:assert/strict';
import {updateRule,START,END} from '../src/rules.mjs';
const rule='## Ask · Report · HTML\n\n[ask-report-html dual-mode]\n- Current policy.\n';

test('identical unmarked section is skipped byte-for-byte',()=>{
 const original='# Other preferences\nKeep this.\n\n'+rule+'\n## Outside\nKeep this too.\n';
 const result=updateRule(original,rule);assert.equal(result.action,'unchanged');assert.equal(result.content,original);
});
test('different unmarked section is updated in place, preserving parent and following sections',()=>{
 const prefix='# User preferences\nDo not change me.\n\n',suffix='## Outside\nPrivate setting.\n';
 const original=prefix+'## Ask · Report · HTML\n\n[ask-report-html dual-mode]\n- Old policy.\n\n'+suffix;
 const result=updateRule(original,rule);assert.equal(result.action,'replace');assert.ok(result.content.startsWith(prefix));assert.ok(result.content.endsWith(suffix));assert.equal(result.content.split('## Ask · Report · HTML').length-1,1);assert.ok(!result.content.includes('Old policy'));
});
test('CRLF and outer blank differences do not cause a rewrite',()=>{
 const original=rule.replace(/\n/g,'\r\n')+'\r\n\r\n';const result=updateRule(original,rule);assert.equal(result.action,'unchanged');assert.equal(result.content,original);
});
test('duplicate owned sections are consolidated without touching sections between them',()=>{
 const original=rule+'\n## Between\nKeep between.\n\n'+rule+'\n## Last\nKeep last.\n';
 const result=updateRule(original,rule);assert.equal(result.action,'replace');assert.equal(result.matches,2);assert.equal(result.content.split('## Ask · Report · HTML').length-1,1);assert.ok(result.content.includes('Keep between.'));assert.ok(result.content.includes('Keep last.'));assert.equal(updateRule(result.content,rule).action,'unchanged');
});
test('complete duplicate managed blocks are consolidated',()=>{
 const block=START+'\n'+rule+END+'\n';const result=updateRule(block+'\n## Keep\nUser text.\n\n'+block,rule);
 assert.equal(result.matches,2);assert.equal(result.content.split(START).length-1,1);assert.ok(result.content.includes('User text.'));assert.equal(updateRule(result.content,rule).action,'unchanged');
});
test('examples inside code fences are not mistaken for active sections or markers',()=>{
 const original='# Notes\n```markdown\n'+START+'\n'+rule+END+'\n```\n## Keep\nUser text.\n';
 const result=updateRule(original,rule);assert.equal(result.action,'append');assert.ok(result.content.startsWith(original));assert.equal(result.matches,0);
});
test('tag-only legacy section is updated without consuming later unrelated sections',()=>{
 const original='# User preferences\n\n[ask-report-html task-report]\n- Old.\n\n## Keep\nUser text.\n';const result=updateRule(original,rule);assert.equal(result.action,'replace');assert.ok(result.content.startsWith('# User preferences\n\n'));assert.ok(result.content.endsWith('## Keep\nUser text.\n'));assert.equal(result.content.split('## Ask · Report · HTML').length-1,1);
});
test('partial or crossing managed boundaries remain an explicit error',()=>{
 for(const original of [START+'\nold',END+'\n',START+'\n'+START+'\n'+END+'\n'])assert.throws(()=>updateRule(original,rule),/边界/);
});
