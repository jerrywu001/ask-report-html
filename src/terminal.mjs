import {stripVTControlCharacters} from 'node:util';

const sgr={heading:'1;36',accent:'36',success:'32',warning:'33',error:'31',muted:'90',strong:'1'};
const segments=new Intl.Segmenter(undefined,{granularity:'grapheme'});
export const plainText=value=>stripVTControlCharacters(String(value)).replace(/[\x00-\x08\x0b-\x1f\x7f]/g,'').replace(/\t/g,'  ');
function cellWidth(char) {
 if(/\p{Extended_Pictographic}|\p{Regional_Indicator}|\u20e3/u.test(char))return 2;
 const c=char.codePointAt(0);
 if(/^[\p{Mark}\u200b-\u200f\u202a-\u202e\u2060-\u206f]+$/u.test(char))return 0;
 return c>=0x1100&&(c<=0x115f||c>=0x2329&&c<=0x232a||c>=0x2e80&&c<=0xa4cf||c>=0xac00&&c<=0xd7a3||c>=0xf900&&c<=0xfaff||c>=0xfe10&&c<=0xfe19||c>=0xfe30&&c<=0xfe6f||c>=0xff01&&c<=0xff60||c>=0xffe0&&c<=0xffe6||c>=0x1b000&&c<=0x1b2ff||c>=0x20000&&c<=0x3fffd)?2:1;
}
export function displayWidth(value) {return [...segments.segment(plainText(value))].reduce((sum,item)=>sum+cellWidth(item.segment),0);}
export function wrapText(value,width) {
 width=Math.max(2,width);const result=[];
 for(const line of plainText(value).split('\n')) {
  if(!line){result.push('');continue;}
  let row='',cells=0;
  for(const token of line.split(/(\s+)/)) {
   if(!token)continue;
   if(/^\s+$/.test(token)){if(row&&!row.endsWith(' ')){row+=' ';cells++;}continue;}
   const tokenWidth=displayWidth(token);
   if(row&&cells+tokenWidth>width&&tokenWidth<=width){result.push(row.trimEnd());row='';cells=0;}
   for(const {segment} of segments.segment(token)) {
    const size=cellWidth(segment);
    if(cells+size>width&&row){result.push(row.trimEnd());row='';cells=0;}
    row+=segment;cells+=size;
   }
  }
  if(row)result.push(row.trimEnd());
 }
 return result;
}
export function tailText(value,width) {
 const chars=[...segments.segment(plainText(value))].map(s=>s.segment);
 if(displayWidth(value)<=width)return plainText(value);
 let text='';for(let i=chars.length-1;i>=0;i--){if(displayWidth(chars[i]+text)>width-1)break;text=chars[i]+text;}
 return '…'+text;
}
export function createTerminal({output=process.stdout,env=process.env}={}) {
 const tty=!!output.isTTY,dumb=env.TERM==='dumb';
 const color=tty&&!dumb&&env.NO_COLOR===undefined&&env.FORCE_COLOR!=='0';
 const width=()=>tty?Math.max(12,Math.min((output.columns||80)-1,100)):Infinity;
 const height=()=>Math.max(8,output.rows||24);
 const paint=(value,tone)=>{const text=plainText(value);return color&&sgr[tone]?'\x1b['+sgr[tone]+'m'+text+'\x1b[0m':text;};
 const lines=(value,tone='muted',indent='  ')=>(tty?wrapText(value,width()-displayWidth(indent)):plainText(value).split('\n')).map(row=>paint(indent+row,tone));
 const write=(value,tone='muted',indent='')=>output.write(lines(value,tone,indent).join('\n')+'\n');
 const heading=(value,{index,total}={})=>lines((index?`${index}/${total}  `:'')+value,'heading');
 return {output,tty,dumb,color,width,height,paint,lines,write,heading};
}
export function createFrame(ui) {
 let previous=[],caret=false;
 function below(){if(caret){ui.output.write('\x1b[1B\r');caret=false;}}
 function draw(rows,{input=false}={}) {
  below();
  const physical=previous.reduce((sum,row)=>sum+Math.max(1,Math.ceil(displayWidth(row)/Math.max(1,(ui.output.columns||80)-1))),0);
  const count=Math.min(physical,ui.height()-1);
  if(count)ui.output.write(`\x1b[${count}A`);
  const next=rows;
  for(let i=0;i<Math.max(count,next.length);i++)ui.output.write('\x1b[2K\r'+(next[i]||'')+'\n');
  if(count>next.length)ui.output.write(`\x1b[${count-next.length}A`);
  previous=[...next];
  if(input&&next.length){ui.output.write('\x1b[1A\r'+(displayWidth(next.at(-1))?`\x1b[${displayWidth(next.at(-1))}C`:''));caret=true;}
 }
 return {draw,below};
}
