import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { parse as parseYaml } from 'yaml';
import { importProjectOpenApi, upsertProjectSchema } from '../openapi/project-tools.js';

const cli=path.resolve('bin/metaproject.js');
const original=String.raw`openapi: 3.1.0
info: {title: Existing API, version: '1'}
servers: [{url: /api}]
paths:
  /users:
    get:
      operationId: listUsers
      x-project-id: op-users
      responses:
        '200':
          description: Users
          content:
            application/json:
              schema: {type: array, items: {type: object}}
              example: [{id: 1}]
components:
  schemas:
    User:
      x-project-id: schema-user
      type: object
      properties: {id: {type: integer}}
`;

function makeProject(target='docs/api/openapi.yaml',withDocument=true){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'metaproject-configured-contract-'));
  fs.writeFileSync(path.join(root,'metaproject.yaml'),['version: 1','openapi: '+target,'components:','  source: components','  output: public/components',''].join('\n'));
  fs.mkdirSync(path.join(root,'components','user-list'),{recursive:true});
  fs.writeFileSync(path.join(root,'components','user-list','component.html'),'<title>Users</title><data-source request="listUsers"><data-table></data-table></data-source>');
  if(withDocument){
    const location=path.join(root,target);
    fs.mkdirSync(path.dirname(location),{recursive:true});
    fs.writeFileSync(location,target.endsWith('.json')?JSON.stringify(parseYaml(original),null,2):original);
  }
  return root;
}
function command(root,...args){
  return spawnSync(process.execPath,[cli,...args,root],{encoding:'utf8'});
}
function assertSuccess(result){
  assert.equal(result.status,0,[
    result.stdout,result.stderr
  ].filter(Boolean).join('\n'));
}
function assertNoRootCopy(root){
  assert.equal(fs.existsSync(path.join(root,'openapi.yaml')),false,'stray root OpenAPI file');
}

test('upsert-schema and upsert-operation write the configured nested YAML and check/build use it',()=>{
  const root=makeProject();
  try{
    const schema=path.join(root,'schema.json');
    const operation=path.join(root,'operation.json');
    fs.writeFileSync(schema,JSON.stringify({name:'Order',properties:{id:{type:'integer'}},required:['id']}));
    fs.writeFileSync(operation,JSON.stringify({method:'get',path:'/orders',operationId:'listOrders',
      responses:{'200':{description:'Orders',content:{'application/json':{schema:{type:'array',items:{type:'object'}},example:[{id:1}]}}}}}));
    const first=command(root,'openapi','upsert-schema','--input',schema);
    assertSuccess(first);
    assert.match(first.stdout,/docs\/api\/openapi\.yaml/);
    const second=command(root,'openapi','upsert-operation','--input',operation);
    assertSuccess(second);
    assert.match(second.stdout,/docs\/api\/openapi\.yaml/);
    const file=path.join(root,'docs/api/openapi.yaml');
    const doc=parseYaml(fs.readFileSync(file,'utf8'));
    assert.equal(doc.components.schemas.User['x-project-id'],'schema-user');
    assert.equal(doc.paths['/users'].get['x-project-id'],'op-users');
    assert.equal(doc.components.schemas.Order.type,'object');
    assert.equal(doc.paths['/orders'].get.operationId,'listOrders');
    const previousOrderId=doc.paths['/orders'].get['x-project-id'];
    assertSuccess(command(root,'openapi','upsert-operation','--input',operation));
    assert.equal(parseYaml(fs.readFileSync(file,'utf8')).paths['/orders'].get['x-project-id'],previousOrderId);
    assertSuccess(command(root,'check'));
    assertSuccess(command(root,'build'));
    assert.ok(fs.existsSync(path.join(root,'public/components/manifest.json')));
    assertNoRootCopy(root);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('JSON target preserves JSON format and existing IDs for mutation',()=>{
  const root=makeProject('docs/api/openapi.json');
  try{
    const input=path.join(root,'schema.json');
    fs.writeFileSync(input,JSON.stringify({name:'User',properties:{id:{type:'integer'},code:{type:'string'}},required:['id']}));
    assertSuccess(command(root,'openapi','upsert-schema','--input',input));
    const source=fs.readFileSync(path.join(root,'docs/api/openapi.json'),'utf8');
    const doc=JSON.parse(source);
    assert.ok(source.trimStart().startsWith('{'));
    assert.equal(doc.components.schemas.User['x-project-id'],'schema-user');
    assert.equal(doc.components.schemas.User.properties.code.type,'string');
    assertSuccess(command(root,'check'));
    assertNoRootCopy(root);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('import respects configured nested JSON target, rejects non-forced replacement, and retains correct references',async()=>{
  const root=makeProject('docs/api/openapi.json');
  const source=path.join(root,'incoming.yaml');
  try{
    fs.writeFileSync(source,original);
    const destination=path.join(root,'docs/api/openapi.json');
    const before=fs.readFileSync(destination,'utf8');
    const denied=command(root,'import-openapi',source);
    assert.equal(denied.status,1);
    assert.match(denied.stderr,/docs\/api\/openapi\.json already contains modeled API resources/);
    assert.equal(fs.readFileSync(destination,'utf8'),before);
    const allowed=command(root,'import-openapi',source,'--force');
    assertSuccess(allowed);
    assert.match(allowed.stdout,/docs\/api\/openapi\.json/);
    const imported=JSON.parse(fs.readFileSync(destination,'utf8'));
    assert.equal(imported.paths['/users'].get.operationId,'listUsers');
    assert.equal(imported.paths['/users'].get['x-project-id'],'op-users');
    assert.equal(imported.components.schemas.User['x-project-id'],'schema-user');
    assertSuccess(command(root,'check'));
    assertNoRootCopy(root);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('import creates a missing configured nested YAML destination, not openapi.yaml',async()=>{
  const root=makeProject('docs/api/openapi.yml',false);
  const source=path.join(root,'source.yaml');
  try{
    fs.writeFileSync(source,original);
    const result=await importProjectOpenApi({root,source});
    assert.equal(result.path,'docs/api/openapi.yml');
    assert.ok(fs.existsSync(path.join(root,'docs/api/openapi.yml')));
    assertSuccess(command(root,'check'));
    assertNoRootCopy(root);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('multi-file specs are not flattened, and a schema $ref cannot be overwritten',()=>{
  const root=makeProject();
  try{
    const rootFile=path.join(root,'docs/api/openapi.yaml');
    const source=original.replace('    User:\n','    Remote: {$ref: "./schemas.yaml#/components/schemas/Remote"}\n    User:\n');
    fs.writeFileSync(rootFile,source);
    const external=path.join(root,'docs/api/schemas.yaml');
    fs.writeFileSync(external,'components:\n  schemas:\n    Remote: {type: object}\n');
    const originalExternal=fs.readFileSync(external,'utf8');
    upsertProjectSchema({root,values:{name:'Local',properties:{key:{type:'string'}}}});
    assert.match(fs.readFileSync(rootFile,'utf8'),/\.\/schemas\.yaml/);
    assert.equal(fs.readFileSync(external,'utf8'),originalExternal);
    assert.throws(()=>upsertProjectSchema({root,values:{name:'Remote',properties:{id:{type:'integer'}}}}),/\$ref/);
    assertNoRootCopy(root);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('failed import does not change configured contract or create stray files',()=>{
  const root=makeProject();
  try{
    const originalFile=path.join(root,'docs/api/openapi.yaml');
    const before=fs.readFileSync(originalFile,'utf8');
    const source=path.join(root,'source.json');
    fs.writeFileSync(source,JSON.stringify({openapi:'3.1.0',paths:{'/bad':{get:{responses:{'200':{content:{'application/json':{schema:{$ref:'schemas.json#/x'}}}}}}}}}));
    const result=command(root,'import-openapi',source,'--force');
    assert.equal(result.status,1);
    assert.match(result.stderr,/external \$ref is not supported/);
    assert.equal(fs.readFileSync(originalFile,'utf8'),before);
    assertNoRootCopy(root);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('out-of-root, symlink, generated output and non-OpenAPI targets are rejected before writes',()=>{
  const root=makeProject();
  const outside=fs.mkdtempSync(path.join(os.tmpdir(),'metaproject-unrelated-'));
  const sentinel=path.join(outside,'file.yaml');
  fs.writeFileSync(sentinel,'untouched');
  try{
    for(const selected of ['../file.yaml',sentinel,'public/components/spec.yaml']){
      fs.writeFileSync(path.join(root,'metaproject.yaml'),['version: 1','openapi: '+selected,''].join('\n'));
      assert.throws(()=>upsertProjectSchema({root,values:{name:'Bad'}}),/Invalid Metaproject OpenAPI target/);
      assert.equal(fs.readFileSync(sentinel,'utf8'),'untouched');
    }
    fs.mkdirSync(path.join(root,'docs'),{recursive:true});
    fs.symlinkSync(sentinel,path.join(root,'docs','linked.yaml'));
    fs.writeFileSync(path.join(root,'metaproject.yaml'),'version: 1\nopenapi: docs/linked.yaml\n');
    assert.throws(()=>upsertProjectSchema({root,values:{name:'Bad'}}),/symlink/);
    fs.writeFileSync(path.join(root,'docs','not-api.json'),'{"name":"unrelated"}');
    fs.writeFileSync(path.join(root,'metaproject.yaml'),'version: 1\nopenapi: docs/not-api.json\n');
    const source=path.join(root,'source.yaml');
    fs.writeFileSync(source,original);
    const result=command(root,'import-openapi',source,'--force');
    assert.equal(result.status,1);
    assert.match(result.stderr,/not an OpenAPI 3\.0\/3\.1 document/);
    assert.equal(fs.readFileSync(path.join(root,'docs','not-api.json'),'utf8'),'{"name":"unrelated"}');
    assertNoRootCopy(root);
  }finally{
    fs.rmSync(root,{recursive:true,force:true});
    fs.rmSync(outside,{recursive:true,force:true});
  }
});
