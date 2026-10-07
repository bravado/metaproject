import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root=path.resolve('.');
const readme=read('README.md');
const gettingStarted=read('docs/getting-started.md');
const cliReference=read('docs/cli-reference.md');
const packageJson=JSON.parse(read('package.json'));
const buildSource=read('build/index.js');

const markdownFiles=[
  'README.md',
  ...walk('docs').filter(file=>file.endsWith('.md')),
  ...walk('examples').filter(file=>file.endsWith('.md')),
  ...walk('skills').filter(file=>file.endsWith('.md'))
].sort();

test('public documentation uses current 0.11 terminology and CLI name',()=>{
  const migration='docs/migrating-to-0.11.md';
  for(const file of markdownFiles){
    const source=read(file);
    assert.doesNotMatch(source,/\bnpx\s+metaproject\b/,file);
    assert.doesNotMatch(source,/_chunks\b/,file);
    assert.doesNotMatch(source,/\bCanvas\b/,file);
    if(file!==migration){
      assert.doesNotMatch(source,/\bapi_root\b/,file);
      assert.doesNotMatch(source,/\bEntity\b/,file);
    }
  }

  assert.match(migrationSource(),/\bapi_root\b/);
  assert.match(migrationSource(),/Entity terminology/);
  assert.match(migrationSource(),/Schema/);
});

test('documented generated output matches the standalone 0.11 build',()=>{
  for(const source of [readme,gettingStarted]){
    assert.match(source,/index\.js/);
    assert.match(source,/all\.js/);
    assert.match(source,/manifest\.json/);
    assert.doesNotMatch(source,/generated chunks/i);
  }
  assert.match(readme,/index\.js[^\n]*host runtime/i);
  assert.match(readme,/all\.js[^\n]*host runtime \+ all local components/i);
});

test('README compatibility values match implementation policy',()=>{
  assert.equal(packageJson.engines.node,'>=22.12.0');
  assert.equal(packageJson.peerDependencies.vite,'>=6');
  assert.match(readme,/Node \*\*22\.12\.0\+\*\*/);
  assert.match(readme,/OpenAPI 3\.0\/3\.1/);
  assert.match(readme,/targeting \*\*ES2022\*\*/);
  assert.match(readme,/Vite \*\*6\+\*\*/);
  assert.match(readme,/runtime ABI \*\*v1\*\*/);
  assert.match(buildSource,/target:\['es2022'\]/);
  assert.match(buildSource,/RUNTIME_ABI_VERSION=1/);
});

test('CLI reference is synchronized with metaproject help',()=>{
  const result=spawnSync(process.execPath,['bin/metaproject.js','help'],{encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);

  const helpMatch=result.stdout.match(/Usage:\n([\s\S]*?)\n\nSOURCE/);
  assert.ok(helpMatch,'CLI help Usage block not found');
  const helpCommands=helpMatch[1].split('\n').map(line=>line.trim()).filter(Boolean);

  const referenceMatch=cliReference.match(/## Complete command surface\n\n```text\n([\s\S]*?)\n```/);
  assert.ok(referenceMatch,'CLI reference command block not found');
  const referenceCommands=referenceMatch[1].split('\n').map(line=>line.trim()).filter(Boolean);

  assert.deepEqual(referenceCommands,helpCommands);
  for(const command of[
    'metaproject api list [project-root]',
    'metaproject api show OPERATION [project-root]',
    'metaproject api call OPERATION [project-root] [parameters/options]'
  ]) assert.ok(referenceCommands.includes(command),command);
});

test('all local Markdown links resolve',()=>{
  const broken=[];
  for(const file of markdownFiles){
    const source=read(file);
    for(const match of source.matchAll(/!?\[[^\]]*\]\(([^)]+)\)/g)){
      const raw=match[1].trim().replace(/^<|>$/g,'');
      const target=raw.split(/\s+["']/)[0];
      if(!target || target.startsWith('#') || /^(?:https?:|mailto:|app:|data:)/.test(target)) continue;
      const withoutAnchor=target.split('#')[0].split('?')[0];
      if(!withoutAnchor) continue;
      const resolved=path.resolve(root,path.dirname(file),decodeURIComponent(withoutAnchor));
      if(!fs.existsSync(resolved)) broken.push(`${file} -> ${target}`);
    }
  }
  assert.deepEqual(broken,[]);
});

test('README and getting-started describe a complete first-success path',()=>{
  for(const source of [readme,gettingStarted]){
    assert.match(source,/npm install --save-dev metaproject/);
    assert.match(source,/metaproject init/);
    assert.match(source,/metaproject check/);
    assert.match(source,/metaproject build/);
    assert.match(source,/components\/all\.js/);
  }
  assert.match(readme,/metaproject import-openapi/);
  assert.match(readme,/components\/user-list\/component\.html/);
});

function migrationSource(){
  return read('docs/migrating-to-0.11.md');
}

function read(relative){
  return fs.readFileSync(path.join(root,relative),'utf8');
}

function walk(relative){
  const dir=path.join(root,relative);
  if(!fs.existsSync(dir)) return [];
  const out=[];
  for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
    const child=path.join(relative,entry.name);
    if(entry.isDirectory()) out.push(...walk(child));
    else out.push(child.replaceAll('\\','/'));
  }
  return out;
}
