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
});

test('CLI exposes package version',()=>{
  const version=spawnSync(process.execPath,[bin,'--version'],{encoding:'utf8'});
  assert.equal(version.status,0,version.stderr);
  assert.equal(version.stdout.trim(),'0.7.0');
});
