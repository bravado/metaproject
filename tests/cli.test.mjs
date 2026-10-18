import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const bin=path.resolve('bin/metaproject.js');

test('CLI init works without loading build dependencies and initializes a checkable project',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'metaproject-cli-'));
  try{
    fs.writeFileSync(path.join(root,'composer.json'),JSON.stringify({name:'objectiveweb/db'}));
    const init=spawnSync(process.execPath,[bin,'init',root],{encoding:'utf8'});
    assert.equal(init.status,0,init.stderr);
    assert.match(init.stdout,/Initialized Metaproject/);
    assert.match(init.stdout,/Existing app with OpenAPI:/);
    assert.match(init.stdout,/Existing app without adequate OpenAPI:/);
    assert.match(init.stdout,/New app:/);
    assert.match(init.stdout,/metaproject check/);
    assert.doesNotMatch(init.stdout,/npx metaproject/);
    const check=spawnSync(process.execPath,[bin,'check',root],{encoding:'utf8'});
    assert.equal(check.status,0,check.stderr);
    assert.match(check.stdout,/Config:\s+metaproject\.yaml/);
    assert.match(check.stdout,/OpenAPI:\s+openapi\.yaml/);
    assert.match(check.stdout,/Components:\s+components \(0 source\)/);
    assert.match(check.stdout,/Scope:\s+default/);
    assert.match(check.stdout,/Schemas:\s+0/);
    assert.match(check.stdout,/Operations:\s+0/);
    assert.match(check.stdout,/Health:\s+0 error\(s\), 0 warning\(s\)/);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('CLI help exposes adoption and build tools',()=>{
  const help=spawnSync(process.execPath,[bin,'help'],{encoding:'utf8'});
  assert.equal(help.status,0,help.stderr);
  assert.match(help.stdout,/metaproject check/);
  assert.match(help.stdout,/import-openapi SOURCE/);
  assert.match(help.stdout,/local YAML\/JSON file/);
  assert.match(help.stdout,/upsert-operation/);
  assert.match(help.stdout,/upsert-schema/);
  assert.match(help.stdout,/metaproject api list/);
  assert.match(help.stdout,/metaproject api show OPERATION/);
  assert.match(help.stdout,/metaproject api call OPERATION/);
  assert.match(help.stdout,/Existing app with OpenAPI:/);
  assert.match(help.stdout,/Existing app without adequate OpenAPI:/);
  assert.match(help.stdout,/New app:/);
  assert.doesNotMatch(help.stdout,/npx metaproject/);
});


test('CLI check reports project health and source counts',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'metaproject-cli-health-'));
  try {
    fs.mkdirSync(path.join(root,'components','user-list'),{recursive:true});
    fs.writeFileSync(path.join(root,'metaproject.yaml'),`version: 1
name: Health
scope: billing
openapi: openapi.yaml
components:
  source: components
  output: public/components
`);
    fs.writeFileSync(path.join(root,'openapi.yaml'),`openapi: 3.1.0
info:
  title: Health API
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
                - {id: 1}
components:
  schemas:
    User:
      x-project-id: schema-user
      type: object
      properties:
        id: {type: integer}
      required: [id]
`);
    fs.writeFileSync(path.join(root,'components','user-list','component.html'),'<title>Users</title><data-source request="listUsers"><data-table></data-table></data-source>');

    const check=spawnSync(process.execPath,[bin,'check',root],{encoding:'utf8'});
    assert.equal(check.status,0,check.stderr);
    assert.match(check.stdout,/Config:\s+metaproject\.yaml/);
    assert.match(check.stdout,/OpenAPI:\s+openapi\.yaml/);
    assert.match(check.stdout,/Components:\s+components \(1 source\)/);
    assert.match(check.stdout,/Scope:\s+billing/);
    assert.match(check.stdout,/Schemas:\s+1/);
    assert.match(check.stdout,/Operations:\s+1/);
    assert.match(check.stdout,/Health:\s+0 error\(s\), 0 warning\(s\)/);
  } finally {
    fs.rmSync(root,{recursive:true,force:true});
  }
});

test('CLI check tells an uninitialized project exactly how to initialize',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'metaproject-cli-uninitialized-'));
  try {
    const check=spawnSync(process.execPath,[bin,'check',root],{encoding:'utf8'});
    assert.equal(check.status,1);
    assert.match(check.stderr,/Metaproject project is not initialized/);
    assert.match(check.stderr,/Run: metaproject init/);
    assert.doesNotMatch(check.stderr,/npx metaproject init/);
    assert.doesNotMatch(check.stderr,/\n\s+at /);
  } finally {
    fs.rmSync(root,{recursive:true,force:true});
  }
});


test('CLI exposes only the canonical schema mutation command',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'metaproject-cli-schema-'));
  const schemaInput=path.join(root,'schema.json');
  try {
    fs.writeFileSync(schemaInput,JSON.stringify({name:'User',properties:{id:{type:'integer'}},required:['id']}));
    const init=spawnSync(process.execPath,[bin,'init',root],{encoding:'utf8'});
    assert.equal(init.status,0,init.stderr);
    const upsert=spawnSync(process.execPath,[bin,'openapi','upsert-schema','--input',schemaInput,root],{encoding:'utf8'});
    assert.equal(upsert.status,0,upsert.stderr);
    assert.match(upsert.stdout,/Created Schema User/);
    const removed=spawnSync(process.execPath,[bin,'openapi','upsert-entity','--input',schemaInput,root],{encoding:'utf8'});
    assert.equal(removed.status,1);
    assert.match(removed.stderr,/Usage: metaproject openapi/);
  } finally {
    fs.rmSync(root,{recursive:true,force:true});
  }
});

test('CLI help omits non-public partial-build and compatibility commands',()=>{
  const help=spawnSync(process.execPath,[bin,'help'],{encoding:'utf8'});
  assert.equal(help.status,0,help.stderr);
  assert.doesNotMatch(help.stdout,/build-api/);
  assert.doesNotMatch(help.stdout,/upsert-entity/);

  const removedBuild=spawnSync(process.execPath,[bin,'build-api'],{encoding:'utf8'});
  assert.equal(removedBuild.status,1);
});

test('CLI exposes package version',()=>{
  const version=spawnSync(process.execPath,[bin,'--version'],{encoding:'utf8'});
  assert.equal(version.status,0,version.stderr);
  assert.equal(version.stdout.trim(),'0.7.0');
});
