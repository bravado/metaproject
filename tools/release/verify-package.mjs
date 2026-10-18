import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

const files=process.argv.slice(2);
assert.equal(files.length,1,'Pass exactly one release .tgz');
const archive=path.resolve(files[0]);
assert.match(archive,/\.tgz$/);
const contents=spawnSync('tar',['-tzf',archive],{encoding:'utf8'});
assert.equal(contents.status,0,contents.stderr);
const names=contents.stdout.split('\n').filter(Boolean);
assert.ok(names.every(x=>x.startsWith('package/')),'Unexpected archive entries');
const mandatory=['package.json','README.md','LICENSE','CHANGELOG.md','CONTRIBUTING.md','SECURITY.md','bin/metaproject.js','build/index.js'];
for(const name of mandatory)assert.ok(names.includes('package/'+name),'Missing packed file: '+name);
for(const name of names){
  const parts=name.split('/');
  assert.ok(!parts.includes('..'),'Unsafe archive path: '+name);
  assert.ok(!parts.includes('node_modules')&&!parts.includes('.git')&&!parts.includes('dist')&&!parts.includes('tests'),
    'Unexpected development asset: '+name);
}
const extracted=spawnSync('tar',['-xOzf',archive,'package/package.json'],{encoding:'utf8'});
assert.equal(extracted.status,0,extracted.stderr);
const artifact=JSON.parse(extracted.stdout);
const local=JSON.parse(fs.readFileSync('package.json','utf8'));
const lock=JSON.parse(fs.readFileSync('package-lock.json','utf8'));
assert.equal(artifact.name,'metaproject');
assert.equal(artifact.version,local.version);
assert.equal(artifact.version,lock.version);
assert.equal(artifact.version,lock.packages[''].version);
assert.equal(artifact.license,'MIT');
assert.equal(artifact.repository?.url,'git+https://github.com/metaproject/core.git');
console.log('Verified release archive '+path.basename(archive)+' ('+names.length+' entries)');
