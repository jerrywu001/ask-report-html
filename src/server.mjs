import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { Installer } from './installer.mjs';
import { loadBundle } from './bundle.mjs';
const TYPES={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8'};
export async function startServer({root,home,env=process.env,port=7331,platform=process.platform}) {
  const installer=new Installer({home,env,platform,bundle:await loadBundle(root)});
  const token=crypto.randomBytes(32).toString('hex');
  let origin;
  const server=http.createServer(async(req,res)=>{
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Cache-Control','no-store');
    res.setHeader('Referrer-Policy','no-referrer');
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; font-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    const json=(status,value)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(value));};
    try {
      if(req.headers.host!==new URL(origin).host) return json(403,{error:'Host 不允许。'});
      if(req.headers.origin && req.headers.origin!==origin) return json(403,{error:'不允许跨站请求。'});
      const url=new URL(req.url,origin);
      if(url.pathname.startsWith('/api/')) {
        const provided=req.headers['x-ask-report-html-token'];
        if(typeof provided!=='string' || provided.length!==token.length || !crypto.timingSafeEqual(Buffer.from(provided),Buffer.from(token))) return json(403,{error:'会话校验失败，请刷新本地页面。'});
        if(req.method==='GET' && url.pathname==='/api/state') return json(200,await installer.state());
        if(req.method!=='POST') return json(405,{error:'不支持此请求方法。'});
        if(req.headers['content-type']?.split(';')[0]!=='application/json') return json(415,{error:'需要 application/json。'});
        let body='';for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body)>16384) {req.resume();return json(413,{error:'请求过大。'});}}
        let data;try{data=JSON.parse(body);}catch{return json(400,{error:'无效 JSON。'});}
        if(url.pathname==='/api/plan') return json(200,await installer.preview(data.agents,data.policy,data.removeLegacy));
        if(url.pathname==='/api/install') return json(200,await installer.install(data.planId));
        return json(404,{error:'未知接口。'});
      }
      if(req.method!=='GET') return json(405,{error:'不支持此请求方法。'});
      const files={'/':'index.html','/app.js':'app.js','/i18n.js':'i18n.js','/style.css':'style.css'};
      const file=files[url.pathname];
      if(!file) return json(404,{error:'Not found'});
      let bytes=await fs.readFile(path.join(root,'web',file));
      if(file==='index.html') bytes=Buffer.from(bytes.toString().replace('__SESSION_TOKEN__',token));
      res.writeHead(200,{'Content-Type':TYPES[path.extname(file)]});res.end(bytes);
    } catch(e){json(400,{error:e.message});}
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});
  origin='http://127.0.0.1:'+server.address().port;
  return {server,origin,installer,close:()=>new Promise(resolve=>server.close(resolve))};
}
