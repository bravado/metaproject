import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const bin=path.resolve('bin/metaproject.js');

test('CLI init works with npx-compatible bin semantics without loading build dependencies', () => {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'metaproject-cli-'));
  try {
    fs.writeFileSync(path.join(root,'composer.json'),JSON.stringify({name:'objectiveweb/db'}));
    const result=spawnSync(process.execPath,[bin,'init',root],{encoding:'utf8'});
    assert.equal(result.status,0,result.stderr);
    assert.match(result.stdout,/Initialized Metaproject/);
    assert.match(result.stdout,/Name: DB/);
    assert.ok(fs.existsSync(path.join(root,'metaproject.yaml')));
    assert.ok(fs.existsSync(path.join(root,'openapi.yaml')));
  } finally { fs.rmSync(root,{recursive:true,force:true}); }
});

test('CLI exposes init/build help and package version', () => {
  const help=spawnSync(process.execPath,[bin,'--help'],{encoding:'utf8'});
  assert.equal(help.status,0,help.stderr);
  assert.match(help.stdout,/metaproject init/);
  assert.match(help.stdout,/metaproject build/);
  assert.match(help.stdout,/metaproject import-openapi/);
  assert.match(help.stdout,/openapi check-examples/);
  assert.match(help.stdout,/openapi upsert-operation/);
  const version=spawnSync(process.execPath,[bin,'--version'],{encoding:'utf8'});
  assert.equal(version.status,0,version.stderr);
  assert.equal(version.stdout.trim(),'0.6.2');
});
