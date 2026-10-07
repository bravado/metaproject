import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.dirname(fileURLToPath(import.meta.url));
const hostRoot=path.join(root,'host','public');
const remoteRoot=path.join(root,'remote','public');

const host=http.createServer((request,response)=>serve(request,response,hostRoot,false));
const remote=http.createServer(async(request,response)=>{
  const url=new URL(request.url,'http://127.0.0.1:4174');
  const cors={'Access-Control-Allow-Origin':'http://127.0.0.1:4173'};
  if(url.pathname==='/api/invoices'){
    return send(response,200,JSON.stringify([{id:'INV-100',total:42}]),'application/json; charset=utf-8',cors);
  }
  return serve(request,response,remoteRoot,true);
});

host.listen(4173,'127.0.0.1',()=>console.log('Host:   http://127.0.0.1:4173'));
remote.listen(4174,'127.0.0.1',()=>console.log('Remote: http://127.0.0.1:4174'));

async function serve(request,response,publicRoot,cors){
  const url=new URL(request.url,'http://127.0.0.1');
  const relative=url.pathname==='/'?'index.html':url.pathname.replace(/^\//,'');
  const target=path.resolve(publicRoot,relative);
  const headers=cors?{'Access-Control-Allow-Origin':'http://127.0.0.1:4173'}:{};
  if(!target.startsWith(publicRoot+path.sep)&&target!==publicRoot)return send(response,403,'Forbidden',undefined,headers);
  try{
    const body=await fs.readFile(target);
    const type=target.endsWith('.html')?'text/html; charset=utf-8':
      target.endsWith('.js')?'application/javascript; charset=utf-8':
      target.endsWith('.json')?'application/json; charset=utf-8':'application/octet-stream';
    send(response,200,body,type,headers);
  }catch{
    send(response,404,'Not found',undefined,headers);
  }
}

function send(response,status,body,type='text/plain; charset=utf-8',headers={}){
  response.writeHead(status,{'Content-Type':type,...headers});
  response.end(body);
}
