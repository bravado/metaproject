import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.dirname(fileURLToPath(import.meta.url));
const publicRoot=path.join(root,'public');
const port=Number(process.env.PORT||4173);

http.createServer(async(request,response)=>{
  const url=new URL(request.url,`http://127.0.0.1:${port}`);

  if(url.pathname==='/api/customers'){
    return send(response,200,JSON.stringify([{id:1,name:'Existing Customer'}]),'application/json; charset=utf-8');
  }

  if(url.pathname.startsWith('/components/')){
    return servePublic(response,url.pathname);
  }

  if(url.pathname==='/customers'){
    return send(response,200,renderCustomers(),'text/html; charset=utf-8');
  }

  return send(response,200,renderHome(),'text/html; charset=utf-8');
}).listen(port,'127.0.0.1',()=>{
  console.log(`Existing app example: http://127.0.0.1:${port}/customers`);
});

function renderHome(){
  return layout('<h1>Existing application</h1><p><a href="/customers">Customers</a></p>');
}

function renderCustomers(){
  return layout(`
    <h1>Existing server-rendered customers page</h1>
    <customer-list id="customers"></customer-list>
    <p id="host-result"></p>
    <script type="module" src="/components/all.js"></script>
    <script type="module">
      document.querySelector('#customers').addEventListener('open-customer', event => {
        document.querySelector('#host-result').textContent =
          'The existing host handled customer ' + event.detail.resource.id;
      });
    </script>
  `);
}

function layout(body){
  return `<!doctype html><html><head><meta charset="utf-8"><title>Existing app</title></head>
  <body><nav><a href="/">Home</a> · <a href="/customers">Customers</a></nav><main>${body}</main></body></html>`;
}

async function servePublic(response,pathname){
  const target=path.resolve(publicRoot,pathname.replace(/^\//,''));
  if(!target.startsWith(publicRoot+path.sep))return send(response,403,'Forbidden');
  try{
    const body=await fs.readFile(target);
    const type=target.endsWith('.js')?'application/javascript; charset=utf-8':
      target.endsWith('.json')?'application/json; charset=utf-8':'application/octet-stream';
    send(response,200,body,type);
  }catch{
    send(response,404,'Not found');
  }
}

function send(response,status,body,type='text/plain; charset=utf-8'){
  response.writeHead(status,{'Content-Type':type});
  response.end(body);
}
