import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { checkProject } from '../project/check.js';

function fixture(componentRequest='listUsers') {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'metaproject-check-'));
  fs.mkdirSync(path.join(root,'ui','user-list'),{recursive:true});
  fs.writeFileSync(path.join(root,'metaproject.yaml'),`version: 1\nname: Test\nopenapi: openapi.yaml\ncomponents:\n  source: ui\n  output: public/components\n`);
  fs.writeFileSync(path.join(root,'openapi.yaml'),`openapi: 3.1.0\ninfo:\n  title: Test\n  version: '1'\nservers:\n  - url: /api\npaths:\n  /users:\n    get:\n      operationId: listUsers\n      x-project-id: op-list-users\n      responses:\n        '200':\n          description: Users\n          content:\n            application/json:\n              schema:\n                type: array\n                items:\n                  $ref: '#/components/schemas/User'\n              example:\n                - id: 1\n                  name: Ada\ncomponents:\n  schemas:\n    User:\n      x-project-id: schema-user\n      type: object\n      properties:\n        id: { type: integer }\n        name: { type: string }\n`);
  fs.writeFileSync(path.join(root,'ui','user-list','component.html'),`<title>Users</title><data-source request="${componentRequest}"><data-table></data-table></data-source>`);
  return root;
}

test('metaproject check validates configured OpenAPI and component source without building',()=>{
  const root=fixture();
  try {
    const result=checkProject({root});
    assert.equal(result.componentSourceDir,'ui');
    assert.equal(result.index.components[0].tag,'user-list');
    assert.deepEqual(result.errors,[]);
  } finally { fs.rmSync(root,{recursive:true,force:true}); }
});

test('metaproject check returns component/OpenAPI contract diagnostics',()=>{
  const root=fixture('missingOperation');
  try {
    const result=checkProject({root});
    assert.ok(result.errors.some(value=>value.code==='unknown-operation'));
  } finally { fs.rmSync(root,{recursive:true,force:true}); }
});
