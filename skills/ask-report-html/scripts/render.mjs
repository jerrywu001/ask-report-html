#!/usr/bin/env node
// Theme and opening defaults for the ask-report-html renderer.
import fs from 'node:fs/promises';
import {realpathSync} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';

const here=path.dirname(fileURLToPath(import.meta.url));
const VALUE_OPTIONS=new Set(['-o','--out','--theme','--mode','--style','--template','--replace']);
export function draftArgument(args) {
  for(let i=1;i<args.length;i++) {
    if(args[i]==='-')return '-';
    if(VALUE_OPTIONS.has(args[i])){i++;continue;}
    if(!args[i].startsWith('-'))return args[i];
  }
}
export function draftHasTheme(source) {
  const header=source.match(/^\uFEFF?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  return !!header&&/^theme\s*:\s*[^\s#]/m.test(header[1]);
}
export function applyDefaults(args,{source='',configuredTheme}={}) {
  const next=[...args];
  if(args[0]==='render'&&!args.some(a=>a==='--theme'||a.startsWith('--theme='))&&!draftHasTheme(source))
    next.push('--theme',configuredTheme&&configuredTheme!=='auto'?configuredTheme:'paper');
  // Patches retain the page's existing theme; video keeps the original adapter.
  if(['render','patch','video'].includes(args[0])&&!args.includes('--open')&&!args.includes('--no-open'))next.push('--no-open');
  return next;
}
async function main(args) {
  let source='',input=null,configuredTheme;
  if(args[0]==='render') {
    const draft=draftArgument(args);
    if(draft==='-') {
      const chunks=[];for await(const chunk of process.stdin)chunks.push(Buffer.from(chunk));input=Buffer.concat(chunks);source=input.toString('utf8');
    } else if(draft) {
      try{source=await fs.readFile(path.resolve(draft),'utf8');}catch{}
    }
    try {
      const config=JSON.parse(await fs.readFile(path.join(process.env.AM_HOME||path.join(os.homedir(),'.ask-report-html'),'config.json'),'utf8'));
      if(typeof config.theme==='string')configuredTheme=config.theme;
    } catch{}
  }
  const child=spawn(process.execPath,[path.join(here,'am.mjs'),...applyDefaults(args,{source,configuredTheme})],{stdio:[input===null?'inherit':'pipe','inherit','inherit'],shell:false});
  if(input!==null){child.stdin.on('error',()=>{});child.stdin.end(input);}
  child.once('error',error=>{console.error(error.message);process.exitCode=1;});
  child.once('exit',(code,signal)=>{process.exitCode=code??(signal?1:0);});
}
let isMain=false;
try{isMain=!!process.argv[1]&&realpathSync(process.argv[1])===fileURLToPath(import.meta.url);}catch{}
if(isMain)main(process.argv.slice(2)).catch(error=>{console.error(error.message);process.exitCode=1;});
