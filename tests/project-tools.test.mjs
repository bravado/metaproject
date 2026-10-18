import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { normalizeImportedOpenApi, findOperation, importProjectOpenApi, upsertProjectSchema } from '../openapi/project-tools.js';

test('import normalization creates local operationId and x-project-id metadata', () => {
  const doc={openapi:'3.1.0',info:{title:'T',version:'1'},paths:{'/users/{id}':{get:{responses:{'200':{description:'ok'}}}}},components:{schemas:{User:{type:'object'}}}};
  normalizeImportedOpenApi(doc);
  const op=findOperation(doc,'getUsersId');
  assert.ok(op);
  assert.match(op.raw['x-project-id'],/^[0-9a-f-]{36}$/i);
  assert.match(doc.components.schemas.User['x-project-id'],/^[0-9a-f-]{36}$/i);
});

test('import normalization preserves existing operationId and project ids', () => {
  const doc={openapi:'3.1.0',paths:{'/users':{get:{operationId:'listUsers','x-project-id':'op-1',responses:{}}}},components:{schemas:{User:{'x-project-id':'schema-1',type:'object'}}}};
  normalizeImportedOpenApi(doc);
  assert.equal(doc.paths['/users'].get.operationId,'listUsers');
  assert.equal(doc.paths['/users'].get['x-project-id'],'op-1');
  assert.equal(doc.components.schemas.User['x-project-id'],'schema-1');
});

test('OpenAPI import accepts a local YAML file as well as URLs', async () => {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'metaproject-import-project-'));
  const sourceRoot=fs.mkdtempSync(path.join(os.tmpdir(),'metaproject-import-source-'));
  try {
    const source=path.join(sourceRoot,'api.yaml');
    fs.writeFileSync(source,`openapi: 3.1.0\ninfo:\n  title: Existing API\n  version: '1'\npaths:\n  /users:\n    get:\n      responses:\n        '200': { description: ok }\ncomponents:\n  schemas:\n    User:\n      type: object\n`);
    const result=await importProjectOpenApi({root,source});
    assert.equal(result.operations,1);
    assert.equal(result.schemas,1);
    assert.equal(result.source,source);
    const imported=fs.readFileSync(path.join(root,'openapi.yaml'),'utf8');
    assert.match(imported,/operationId: getUsers/);
    assert.match(imported,/x-project-id:/);
    assert.match(imported,/x-metaproject-import-source:/);
  } finally {
    fs.rmSync(root,{recursive:true,force:true});
    fs.rmSync(sourceRoot,{recursive:true,force:true});
  }
});


test('schema upsert writes components.schemas and preserves its stable project id', () => {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'metaproject-schema-project-'));
  try {
    const first=upsertProjectSchema({root,values:{name:'Voucher',properties:{id:{type:'integer'}},required:['id']}});
    assert.equal(first.created,true);
    const created=fs.readFileSync(path.join(root,'openapi.yaml'),'utf8');
    assert.match(created,/Voucher:/);
    assert.match(created,/x-project-id:/);
    const second=upsertProjectSchema({root,values:{name:'Voucher',properties:{id:{type:'integer'},code:{type:'string'}},required:['id','code']}});
    assert.equal(second.created,false);
    assert.equal(second.id,first.id);
  } finally {
    fs.rmSync(root,{recursive:true,force:true});
  }
});
