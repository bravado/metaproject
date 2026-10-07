import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';
import { buildProject } from '../build/index.js';

const temp=await fs.mkdtemp(path.join(os.tmpdir(),'metaproject-browser-e2e-'));
let hostRoot=null;
let remoteRoot=null;

const state={
  users:[{userId:1,name:'Ada'},{userId:2,name:'Grace'}],
  listUsersCalls:0,
  getUserCalls:0,
  hostItemsCalls:0,
  remoteInvoiceCalls:0,
  mutation:null
};

const hostServer=http.createServer((request,response)=>handleHost(request,response));
const remoteServer=http.createServer((request,response)=>handleRemote(request,response));
const hostOrigin=await listen(hostServer);
const remoteOrigin=await listen(remoteServer);

let browser;
try {
  hostRoot=path.join(temp,'host');
  remoteRoot=path.join(temp,'remote');
  await createHostFixture(hostRoot);
  await createRemoteFixture(remoteRoot,remoteOrigin);
  await Promise.all([buildProject({root:hostRoot}),buildProject({root:remoteRoot})]);

  browser=await chromium.launch({headless:true});
  const page=await browser.newPage();
  const pageErrors=[];
  page.on('pageerror',error=>pageErrors.push(error.message));

  await page.goto(hostOrigin+'/',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.__metaprojectReady===true||Boolean(window.__metaprojectBootError));
  const bootError=await page.evaluate(()=>window.__metaprojectBootError||null);
  assert.equal(bootError,null,'Host page failed to load generated components: '+bootError);

  await testReadFlow(page);
  await testSemanticEventFlow(page);
  await testMutationFlow(page);
  await testErrorFlow(page);
  await testRemoteRuntimeFlow(page,remoteOrigin);

  assert.deepEqual(pageErrors,[],'Unexpected browser page errors: '+pageErrors.join('; '));
  console.log('Browser E2E verified generated read, event, mutation, error, and remote-runtime flows.');
} finally {
  await browser?.close();
  await close(hostServer);
  await close(remoteServer);
  await fs.rm(temp,{recursive:true,force:true});
}

async function testReadFlow(page){
  await page.waitForFunction(()=>{
    const root=document.querySelector('user-list')?.shadowRoot;
    return root?.querySelector('data-table tbody')?.textContent?.includes('Ada');
  });
  const rows=await page.evaluate(()=>{
    const table=document.querySelector('user-list').shadowRoot.querySelector('data-table');
    return [...table.querySelectorAll('tbody tr')].map(row=>row.textContent.trim());
  });
  assert.equal(rows.length,2);
  assert.match(rows[0],/Ada/);
  assert.equal(state.listUsersCalls,1);
}

async function testSemanticEventFlow(page){
  await page.evaluate(()=>{
    window.__semanticEvents=[];
    document.addEventListener('select-user',event=>{
      window.__semanticEvents.push({
        bubbles:event.bubbles,
        composed:event.composed,
        resource:event.detail?.resource
      });
    },{once:true});
  });

  await page.locator('user-list button[data-action="select-user"]').first().click();
  await page.waitForFunction(()=>window.__semanticEvents?.length===1);
  const [event]=await page.evaluate(()=>window.__semanticEvents);
  assert.equal(event.bubbles,true);
  assert.equal(event.composed,true);
  assert.deepEqual(event.resource,{userId:1,name:'Ada'});
}

async function testMutationFlow(page){
  await page.waitForFunction(()=>{
    const editor=document.querySelector('user-editor')?.shadowRoot;
    const form=editor?.querySelector('data-form');
    return Boolean(form?.shadowRoot?.querySelector('input'));
  });

  await page.evaluate(()=>{
    window.__operationComplete=null;
    document.addEventListener('operation-complete',event=>{
      window.__operationComplete={
        operationId:event.detail?.operationId,
        resource:event.detail?.resource,
        value:event.detail?.value
      };
    },{once:true});

    const editor=document.querySelector('user-editor').shadowRoot;
    const form=editor.querySelector('data-form');
    const label=[...form.shadowRoot.querySelectorAll('label')].find(
      item=>item.querySelector('.label')?.textContent?.trim()==='Name'
    );
    const input=label?.querySelector('input');
    if(!input) throw new Error('Could not find generated Name input');
    input.value='Katherine';
    input.dispatchEvent(new Event('input',{bubbles:true,composed:true}));
  });

  await page.locator('user-editor button[data-operation="updateUser"]').click();
  await page.waitForFunction(()=>Boolean(window.__operationComplete));
  await waitUntil(()=>state.mutation!==null&&state.getUserCalls>=2&&state.listUsersCalls>=2);

  assert.equal(state.mutation.method,'PUT');
  assert.equal(state.mutation.pathname,'/api/users/1');
  assert.equal(state.mutation.query.notify,'true');
  assert.equal(state.mutation.headers['x-mode'],'browser');
  assert.deepEqual(state.mutation.body,{name:'Katherine'});

  const complete=await page.evaluate(()=>window.__operationComplete);
  assert.equal(complete.operationId,'updateUser');
  assert.deepEqual(complete.resource,{userId:1,name:'Katherine'});
  assert.deepEqual(complete.value,{userId:1,name:'Katherine'});

  await page.waitForFunction(()=>{
    const root=document.querySelector('user-list')?.shadowRoot;
    return root?.querySelector('data-table tbody')?.textContent?.includes('Katherine');
  });
}

async function testErrorFlow(page){
  await page.waitForFunction(()=>window.__dataErrors?.length>0);
  const error=await page.evaluate(()=>window.__dataErrors[0]);
  assert.equal(error.name,'RestClientError');
  assert.equal(error.status,500);
  assert.match(error.message,/HTTP 500/);

  const hasError=await page.evaluate(
    ()=>document.querySelector('failure-panel')?.shadowRoot?.querySelector('data-source')?.hasAttribute('error')
  );
  assert.equal(hasError,true);
}

async function testRemoteRuntimeFlow(page,remoteOrigin){
  await page.waitForFunction(()=>{
    const root=document.querySelector('invoice-list')?.shadowRoot;
    return root?.querySelector('data-table tbody')?.textContent?.includes('INV-100');
  });
  assert.equal(state.remoteInvoiceCalls,1);
  assert.equal(state.hostItemsCalls,0,'Remote listItems must not use the host scope/client');

  const duplicateError=await page.evaluate(async url=>{
    try {
      await import(url+'?duplicate-runtime=1');
      return null;
    } catch(error) {
      return error?.message||String(error);
    }
  },remoteOrigin+'/components/index.js');
  assert.match(duplicateError||'',/A Metaproject runtime is already installed for ABI v1/);
}

async function createHostFixture(root){
  await fs.mkdir(path.join(root,'components','user-list'),{recursive:true});
  await fs.mkdir(path.join(root,'components','user-editor'),{recursive:true});
  await fs.mkdir(path.join(root,'components','failure-panel'),{recursive:true});

  await fs.writeFile(path.join(root,'metaproject.yaml'),`version: 1
name: Browser E2E Host
scope: host
openapi: openapi.yaml
components:
  source: components
  output: public/components
`);

  await fs.writeFile(path.join(root,'openapi.yaml'),`openapi: 3.1.0
info:
  title: Browser E2E Host API
  version: 1.0.0
servers:
  - url: /api
paths:
  /users:
    get:
      operationId: listUsers
      x-project-id: op-list-users
      responses:
        '200':
          description: Users
          content:
            application/json:
              schema:
                type: array
                items:
                  $ref: '#/components/schemas/User'
              example:
                - { userId: 1, name: Ada }
                - { userId: 2, name: Grace }
  /users/{userId}:
    get:
      operationId: getUser
      x-project-id: op-get-user
      parameters:
        - in: path
          name: userId
          required: true
          schema: { type: integer }
      responses:
        '200':
          description: User
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/User'
              example: { userId: 1, name: Ada }
    put:
      operationId: updateUser
      x-project-id: op-update-user
      parameters:
        - in: path
          name: userId
          required: true
          schema: { type: integer }
        - in: query
          name: notify
          required: true
          schema: { type: boolean }
        - in: header
          name: X-Mode
          required: true
          schema: { type: string }
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/UserUpdate'
      responses:
        '200':
          description: Updated user
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/User'
              example: { userId: 1, name: Katherine }
  /fail:
    get:
      operationId: failRequest
      x-project-id: op-fail-request
      responses:
        '200':
          description: Success shape
          content:
            application/json:
              schema:
                type: object
                properties:
                  ok: { type: boolean }
              example: { ok: true }
        '500':
          description: Intentional browser E2E failure
  /host-items:
    get:
      operationId: listItems
      x-project-id: op-host-items
      responses:
        '200':
          description: Host items
          content:
            application/json:
              schema:
                type: array
                items: { type: object }
              example:
                - { id: host-only }
components:
  schemas:
    User:
      x-project-id: schema-user
      type: object
      properties:
        userId: { type: integer }
        name: { type: string }
      required: [userId, name]
    UserUpdate:
      x-project-id: schema-user-update
      type: object
      properties:
        name: { type: string }
      required: [name]
`);

  await fs.writeFile(
    path.join(root,'components','user-list','component.html'),
    '<title>Users</title>\n<data-source request="listUsers"><data-table><button data-action="select-user">Select</button></data-table></data-source>\n'
  );
  await fs.writeFile(
    path.join(root,'components','user-editor','component.html'),
    '<title>User editor</title>\n<component-property name="userId" type="integer" required example="1"></component-property>\n<data-source request="getUser" user-id=${userId} notify="true" x-mode="browser"><data-form><button data-operation="updateUser">Save</button></data-form></data-source>\n'
  );
  await fs.writeFile(
    path.join(root,'components','failure-panel','component.html'),
    '<title>Failure</title>\n<data-source request="failRequest"><data-label></data-label></data-source>\n'
  );
}

async function createRemoteFixture(root,origin){
  await fs.mkdir(path.join(root,'components','invoice-list'),{recursive:true});
  await fs.writeFile(path.join(root,'metaproject.yaml'),`version: 1
name: Browser E2E Remote
scope: billing
openapi: openapi.yaml
components:
  source: components
  output: public/components
`);
  await fs.writeFile(path.join(root,'openapi.yaml'),`openapi: 3.1.0
info:
  title: Browser E2E Remote API
  version: 1.0.0
servers:
  - url: ${origin}/api
paths:
  /invoices:
    get:
      operationId: listItems
      x-project-id: op-list-invoices
      responses:
        '200':
          description: Invoices
          content:
            application/json:
              schema:
                type: array
                items:
                  type: object
                  properties:
                    id: { type: string }
                    total: { type: number }
              example:
                - { id: INV-100, total: 42 }
`);
  await fs.writeFile(
    path.join(root,'components','invoice-list','component.html'),
    '<title>Invoices</title>\n<data-source request="listItems"><data-table></data-table></data-source>\n'
  );
}

async function handleHost(request,response){
  const url=new URL(request.url,hostOrigin);
  if(url.pathname==='/'){
    return send(response,200,hostPage(remoteOrigin),'text/html; charset=utf-8');
  }
  if(url.pathname.startsWith('/components/')){
    return serveFile(response,path.join(hostRoot,'public',url.pathname));
  }
  if(url.pathname==='/api/users'&&request.method==='GET'){
    state.listUsersCalls++;
    return json(response,200,state.users);
  }
  if(url.pathname==='/api/users/1'&&request.method==='GET'){
    state.getUserCalls++;
    return json(response,200,state.users[0]);
  }
  if(url.pathname==='/api/users/1'&&request.method==='PUT'){
    const body=await readJson(request);
    state.mutation={
      method:request.method,
      pathname:url.pathname,
      query:Object.fromEntries(url.searchParams),
      headers:request.headers,
      body
    };
    state.users[0]={userId:1,name:body.name};
    return json(response,200,state.users[0]);
  }
  if(url.pathname==='/api/fail'&&request.method==='GET'){
    return json(response,500,{error:'intentional'});
  }
  if(url.pathname==='/api/host-items'&&request.method==='GET'){
    state.hostItemsCalls++;
    return json(response,200,[{id:'HOST-ONLY'}]);
  }
  send(response,404,'Not found');
}

async function handleRemote(request,response){
  response.setHeader('Access-Control-Allow-Origin','*');
  const url=new URL(request.url,remoteOrigin);
  if(url.pathname.startsWith('/components/')){
    return serveFile(response,path.join(remoteRoot,'public',url.pathname),{'Access-Control-Allow-Origin':'*'});
  }
  if(url.pathname==='/api/invoices'&&request.method==='GET'){
    state.remoteInvoiceCalls++;
    return json(response,200,[{id:'INV-100',total:42}],{'Access-Control-Allow-Origin':'*'});
  }
  send(response,404,'Not found',undefined,{'Access-Control-Allow-Origin':'*'});
}

function hostPage(remote){
  return `<!doctype html>
<html>
<head><meta charset="utf-8"><title>Metaproject browser E2E</title></head>
<body>
  <user-list></user-list>
  <user-editor user-id="1"></user-editor>
  <failure-panel></failure-panel>
  <invoice-list></invoice-list>
  <script>
    window.__dataErrors=[];
    document.addEventListener('data-error',event=>{
      const error=event.detail?.error;
      window.__dataErrors.push({
        name:error?.name,
        status:error?.status,
        message:error?.message
      });
    });
  </script>
  <script type="module">
    try {
      await import('/components/index.js');
      await import('/components/user-list.js');
      await import('/components/user-editor.js');
      await import('/components/failure-panel.js');
      await import(${JSON.stringify(remote+'/components/invoice-list.js')});
      window.__metaprojectReady=true;
    } catch(error) {
      window.__metaprojectBootError=error?.stack||error?.message||String(error);
    }
  </script>
</body>
</html>`;
}

async function serveFile(response,file,headers={}){
  try {
    const data=await fs.readFile(file);
    const ext=path.extname(file);
    const type=ext==='.js'?'application/javascript; charset=utf-8':
      ext==='.json'?'application/json; charset=utf-8':'application/octet-stream';
    send(response,200,data,type,headers);
  } catch {
    send(response,404,'Not found',undefined,headers);
  }
}

function json(response,status,value,headers={}){
  send(response,status,JSON.stringify(value),'application/json; charset=utf-8',headers);
}

function send(response,status,body,type='text/plain; charset=utf-8',headers={}){
  response.writeHead(status,{'Content-Type':type,...headers});
  response.end(body);
}

async function readJson(request){
  let body='';
  for await(const chunk of request) body+=chunk;
  return body?JSON.parse(body):undefined;
}

function listen(server){
  return new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(0,'127.0.0.1',()=>{
      server.off('error',reject);
      const address=server.address();
      resolve(`http://127.0.0.1:${address.port}`);
    });
  });
}

function close(server){
  return new Promise(resolve=>{
    if(!server.listening)return resolve();
    server.close(()=>resolve());
  });
}

async function waitUntil(predicate,{timeout=5000,interval=20}={}){
  const deadline=Date.now()+timeout;
  while(Date.now()<deadline){
    if(predicate())return;
    await new Promise(resolve=>setTimeout(resolve,interval));
  }
  throw new Error('Timed out waiting for browser E2E server state');
}
