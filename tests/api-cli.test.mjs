import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runApiCli } from '../api/index.js';

function fixture() {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'metaproject-api-cli-'));
  fs.mkdirSync(path.join(root,'components'),{recursive:true});
  fs.writeFileSync(path.join(root,'metaproject.yaml'),`version: 1
name: API CLI
openapi: openapi.yaml
components:
  source: components
  output: public/components
`);
  fs.writeFileSync(path.join(root,'openapi.yaml'),`openapi: 3.1.0
info:
  title: API CLI
  version: '1'
servers:
  - url: https://api.example.test
paths:
  /users:
    get:
      operationId: listUsers
      x-project-id: op-list-users
      parameters:
        - name: page
          in: query
          schema: { type: integer }
      responses:
        '200':
          description: Users
          content:
            application/json:
              schema:
                type: array
                items:
                  $ref: '#/components/schemas/User'
              example: [{ id: 1, name: Ada }]
  /users/{id}:
    get:
      operationId: getUser
      x-project-id: op-get-user
      summary: Get one user
      parameters:
        - name: id
          in: path
          required: true
          schema: { type: integer }
      responses:
        '200':
          description: User
          content:
            application/json:
              schema: { $ref: '#/components/schemas/User' }
              example: { id: 1, name: Ada }
    patch:
      operationId: updateUser
      x-project-id: op-update-user
      parameters:
        - name: id
          in: path
          required: true
          schema: { type: integer }
        - name: dryRun
          in: query
          schema: { type: boolean }
        - name: server
          in: query
          schema: { type: string }
        - name: X-Tenant
          in: header
          required: true
          schema: { type: string }
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: '#/components/schemas/User' }
      responses:
        '200':
          description: Updated
          content:
            application/json:
              schema: { $ref: '#/components/schemas/User' }
              example: { id: 1, name: Ada }
components:
  schemas:
    User:
      x-project-id: schema-user
      type: object
      properties:
        id: { type: integer }
        name: { type: string }
`);
  return root;
}

function io(fetch) {
  let stdout=''; let stderr='';
  return {
    options:{
      fetch,
      isTTY:false,
      stdout:value=>{stdout+=value;},
      stderr:value=>{stderr+=value;},
      readStdin:()=>'{"name":"Stdin"}'
    },
    stdout:()=>stdout,
    stderr:()=>stderr
  };
}

test('api list and show expose OpenAPI operations without making requests', async()=>{
  const root=fixture();
  try {
    const list=io();
    const listResult=await runApiCli(['list',root],list.options);
    assert.equal(listResult.exitCode,0);
    assert.match(list.stdout(),/GET\s+listUsers\s+\/users/);
    assert.match(list.stdout(),/PATCH\s+updateUser\s+\/users\/\{id\}/);

    const show=io();
    const showResult=await runApiCli(['show','getUser',root],show.options);
    assert.equal(showResult.exitCode,0);
    assert.match(show.stdout(),/GET \/users\/\{id\}/);
    assert.match(show.stdout(),/summary: Get one user/);
    assert.match(show.stdout(),/--id\s+path\s+integer\s+required/);
    assert.match(show.stdout(),/server: https:\/\/api\.example\.test/);
  } finally {
    fs.rmSync(root,{recursive:true,force:true});
  }
});

test('api call maps OpenAPI parameters, headers, body, response and verbose output', async()=>{
  const root=fixture();
  const bodyFile=path.join(root,'user.json');
  fs.writeFileSync(bodyFile,JSON.stringify({name:'Grace'}));
  const calls=[];
  const output=io(async(url,init)=>{
    calls.push({url:String(url),init});
    return new Response(JSON.stringify({id:42,name:'Grace'}),{
      status:200,
      statusText:'OK',
      headers:{'content-type':'application/json','x-request-id':'req-1'}
    });
  });
  try {
    const result=await runApiCli([
      'call','updateUser',root,
      '--id','42',
      '--dryRun','true',
      '--X-Tenant','acme',
      '-H','Authorization: Bearer token',
      '--body',`@${bodyFile}`,
      '--include',
      '--verbose'
    ],output.options);

    assert.equal(result.exitCode,0);
    assert.equal(calls.length,1);
    assert.equal(calls[0].url,'https://api.example.test/users/42?dryRun=true');
    assert.equal(calls[0].init.method,'PATCH');
    assert.equal(calls[0].init.headers['X-Tenant'],'acme');
    assert.equal(calls[0].init.headers.Authorization,'Bearer token');
    assert.equal(calls[0].init.headers['Content-Type'],'application/json');
    assert.equal(calls[0].init.body,JSON.stringify({name:'Grace'}));
    assert.match(output.stdout(),/^HTTP 200 OK/m);
    assert.match(output.stdout(),/"id":42/);
    assert.match(output.stderr(),/> PATCH https:\/\/api\.example\.test\/users\/42\?dryRun=true/);
  } finally {
    fs.rmSync(root,{recursive:true,force:true});
  }
});

test('api call accepts stdin bodies and --param for reserved parameter names', async()=>{
  const root=fixture();
  const output=io(async(_url,init)=>new Response(init.body,{status:200,headers:{'content-type':'application/json'}}));
  try {
    const result=await runApiCli([
      'call','updateUser',root,
      '--id','1',
      '--X-Tenant','acme',
      '--param','server=blue',
      '--body','-'
    ],output.options);
    assert.equal(result.exitCode,0);
    assert.equal(output.stdout().trim(),'{"name":"Stdin"}');
  } finally {
    fs.rmSync(root,{recursive:true,force:true});
  }
});

test('api call returns exit code 4 for non-2xx responses while preserving the body', async()=>{
  const root=fixture();
  const output=io(async()=>new Response(JSON.stringify({error:'not found'}),{
    status:404,
    statusText:'Not Found',
    headers:{'content-type':'application/json'}
  }));
  try {
    const result=await runApiCli(['call','getUser',root,'--id','404'],output.options);
    assert.equal(result.exitCode,4);
    assert.equal(result.status,404);
    assert.match(output.stdout(),/"error":"not found"/);
  } finally {
    fs.rmSync(root,{recursive:true,force:true});
  }
});

test('api call reports missing required inputs with exit code 2 and requires absolute CLI servers', async()=>{
  const root=fixture();
  try {
    await assert.rejects(
      ()=>runApiCli(['call','getUser',root],io(async()=>{throw new Error('should not fetch');}).options),
      error=>error?.exitCode===2 && /missing required path parameter id/i.test(error.message)
    );

    fs.writeFileSync(path.join(root,'openapi.yaml'),fs.readFileSync(path.join(root,'openapi.yaml'),'utf8').replace('https://api.example.test','/api'));
    await assert.rejects(
      ()=>runApiCli(['call','getUser',root,'--id','1'],io(async()=>{throw new Error('should not fetch');}).options),
      error=>error?.exitCode===1 && /absolute HTTP\(S\) URL/i.test(error.message)
    );
  } finally {
    fs.rmSync(root,{recursive:true,force:true});
  }
});
