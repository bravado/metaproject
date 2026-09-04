import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveOpenApiRefs, resolveLocalRef } from '../openapi/index.js';

test('OpenAPI resolver resolves external refs independently of Canvas/filesystem implementation', () => {
  const root={openapi:'3.1.0',paths:{'/users':{$ref:'paths.json#/UserPath'}}};
  const files={
    'paths.json':JSON.stringify({UserPath:{get:{operationId:'listUsers',responses:{'200':{description:'ok'}}}}})
  };
  const resolved=resolveOpenApiRefs(root,{sourcePath:'openapi.yaml',readFile:path=>files[path]});
  assert.equal(resolved.paths['/users'].get.operationId,'listUsers');
  assert.equal(resolved.paths['/users']['x-source-ref'],'paths.json#/UserPath');
});

test('local refs can be resolved selectively without recursively expanding schemas', () => {
  const document={components:{parameters:{UserId:{name:'id',in:'path',required:true,schema:{type:'integer'}}}}};
  assert.deepEqual(resolveLocalRef(document,{$ref:'#/components/parameters/UserId'}),document.components.parameters.UserId);
});
