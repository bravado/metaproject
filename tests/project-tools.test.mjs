import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeImportedOpenApi, findOperation } from '../openapi/project-tools.js';

test('import normalization creates local operationId and x-project-id metadata', () => {
  const doc={openapi:'3.1.0',info:{title:'T',version:'1'},paths:{'/users/{id}':{get:{responses:{'200':{description:'ok'}}}}},components:{schemas:{User:{type:'object'}}}};
  normalizeImportedOpenApi(doc);
  const op=findOperation(doc,'getUsersId');
  assert.ok(op);
  assert.match(op.raw['x-project-id'],/^[0-9a-f-]{36}$/i);
  assert.match(doc.components.schemas.User['x-project-id'],/^[0-9a-f-]{36}$/i);
});

test('import normalization preserves existing operationId and project ids', () => {
  const doc={openapi:'3.1.0',paths:{'/users':{get:{operationId:'listUsers','x-project-id':'op-1',responses:{}}}},components:{schemas:{User:{'x-project-id':'entity-1',type:'object'}}}};
  normalizeImportedOpenApi(doc);
  assert.equal(doc.paths['/users'].get.operationId,'listUsers');
  assert.equal(doc.paths['/users'].get['x-project-id'],'op-1');
  assert.equal(doc.components.schemas.User['x-project-id'],'entity-1');
});
