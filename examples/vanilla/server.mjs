import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.dirname(fileURLToPath(import.meta.url));
const publicRoot=path.join(root,'public');
const users=[
  {id:1,name:'Ada'},
  {id:2,name:'Grace'},
  {id:3,name:'Katherine'}
];
const port=Number(process.env.PORT||4173);

http.createServer(async(request,response)=>{
  const url=new URL(request.url,`http://127.0.0.1:${port}`);
  if(url.pathname==='/api/users'){
    const limit=Number(url.searchParams.get('limit')||users.length);
    return send(response,200,JSON.stringify(users.slice(0,limit)),'application/json; charset=utf-8');
  }
  const relative=url.pathname==='/'?'index.html':url.pathname.replace(/^\//,'');
  const target=path.resolve(publicRoot,relative);
  if(!target.startsWith(publicRoot+path.sep)&&target!==publicRoot)return send(response,403,'Forbidden');
  try{
    const body=await fs.readFile(target);
    const type=target.endsWith('.html')?'text/html; charset=utf-8':
      target.endsWith('.js')?'application/javascript; charset=utf-8':
      target.endsWith('.json')?'application/json; charset=utf-8':'application/octet-stream';
    send(response,200,body,type);
  }catch{
    send(response,404,'Not found');
  }
}).listen(port,'127.0.0.1',()=>{
  console.log(`Vanilla example: http://127.0.0.1:${port}`);
});

function send(response,status,body,type='text/plain; charset=utf-8'){
  response.writeHead(status,{'Content-Type':type});
  response.end(body);
}
