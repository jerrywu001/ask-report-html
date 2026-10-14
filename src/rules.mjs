export const START = '<!-- ask-report-html:start -->';
export const END = '<!-- ask-report-html:end -->';
const normalize = text => text.replace(/\r\n?/g,'\n').trim();
const titleKey = title => title.replace(/\s/g,'').replace(/#+$/,'');
const OWN_TAG = /^\s*\[ask-report-html (?:dual-mode|task-report)\]\s*$/;

function activeLines(text) {
  const lines=[];let offset=0,fence=null;
  for(const raw of text.match(/[^\n]*\n|[^\n]+$/g)||[]) {
    const value=raw.replace(/\r?\n$/,'');
    const match=value.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
    if(fence) {
      if(match&&match[1][0]===fence.char&&match[1].length>=fence.length&&!match[2].trim())fence=null;
    } else if(match)fence={char:match[1][0],length:match[1].length};
    else lines.push({value,start:offset,end:offset+raw.length});
    offset+=raw.length;
  }
  return lines;
}

export function updateRule(original,rule) {
  const lines=activeLines(original),ranges=[];let pending=null;
  for(const line of lines) {
    const value=line.value.trim();
    if((value.startsWith(START)||value.startsWith(END))&&value!==START&&value!==END)throw new Error('规范标记边界损坏；未改写文件。');
    if(line.value.trim()===START) {
      if(pending)throw new Error('规范标记边界损坏；未改写文件。');
      pending=line;
    } else if(line.value.trim()===END) {
      if(!pending)throw new Error('规范标记边界损坏；未改写文件。');
      ranges.push({start:pending.start,end:line.end,body:original.slice(pending.end,line.start),managed:true});pending=null;
    }
  }
  if(pending)throw new Error('规范标记边界损坏；未改写文件。');
  const ruleTitle=rule.match(/^\s*(#{1,6})\s+(.+)$/m)?.[2];
  const headings=lines.map(line=>({line,match:line.value.match(/^ {0,3}(#{1,6})\s+(.+?)\s*#*\s*$/)})).filter(h=>h.match);
  const sections=[];
  for(let i=0;i<headings.length;i++) {
    const heading=headings[i],start=heading.line.start,depth=heading.match[1].length;
    if(ranges.some(r=>start>=r.start&&start<r.end))continue;
    const next=headings.slice(i+1).find(h=>h.match[1].length<=depth);
    const end=next?.line.start??original.length;
    if(titleKey(heading.match[2])===titleKey(ruleTitle||''))
      sections.push({start,end,body:original.slice(start,end),managed:false});
  }
  for(const line of lines.filter(l=>OWN_TAG.test(l.value))) {
    if([...ranges,...sections].some(r=>line.start>=r.start&&line.start<r.end))continue;
    const next=headings.find(h=>h.line.start>line.start);
    sections.push({start:line.start,end:next?.line.start??original.length,body:original.slice(line.start,next?.line.start??original.length),managed:false});
  }
  // A heading outside a marker pair owns its entire Markdown section. Avoid
  // processing overlapping nested ranges twice.
  const all=[...ranges.filter(r=>!sections.some(s=>r.start>=s.start&&r.end<=s.end)),...sections]
    .sort((a,b)=>a.start-b.start||b.end-a.end);
  const owned=[];
  for(const range of all) {
    if(owned.some(r=>range.start>=r.start&&range.end<=r.end))continue;
    if(owned.length&&range.start<owned.at(-1).end)throw new Error('规范段边界重叠；未改写文件。');
    owned.push(range);
  }
  const newline=original.includes('\r\n')?'\r\n':'\n';
  const current=rule.trim().replace(/\r\n?/g,'\n').replace(/\n/g,newline);
  if(!owned.length) {
    const block=[START,current,END].join(newline)+newline;
    const gap=original?original.endsWith(newline)?newline:newline+newline:'';
    return {content:original+gap+block,action:original?'append':'create',matches:0};
  }
  if(owned.length===1&&normalize(owned[0].body)===normalize(rule))
    return {content:original,action:'unchanged',matches:1};
  const first=owned[0];
  const trailing=original.slice(first.start,first.end).match(/(?:\r?\n[ \t]*)+$/)?.[0]||newline;
  const replacement=(first.managed?[START,current,END].join(newline):current)+trailing;
  let content=original,cursor=0,result='';
  for(let i=0;i<owned.length;i++) {
    const range=owned[i];result+=content.slice(cursor,range.start)+(i===0?replacement:'');cursor=range.end;
  }
  result+=content.slice(cursor);
  return {content:result,action:'replace',matches:owned.length};
}
export function appendRule(original,rule){return updateRule(original,rule).content;}
