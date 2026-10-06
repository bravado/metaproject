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
    assert.match(init.stdout,/Existing API spec:/);
    assert.match(init.stdout,/metaproject check/);
    const check=spawnSync(process.execPath,[bin,'check',root],{encoding:'utf8'});
    assert.equal(check.status,0,check.stderr);
    assert.match(check.stdout,/0 error\(s\)/);
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
