import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const PUBLIC_EXPORTS={
  './components':'./components/index.js',
  './data-source':'./data-source/index.js',
  './compiler':'./compiler/index.js',
  './compiler/browser':'./compiler/browser.js',
  './vite':'./vite/index.js',
  './openapi':'./openapi/index.js',
  './project':'./project/index.js'
};

test('package exports exactly the frozen 0.11 public JavaScript surface',async()=>{
  const pkg=JSON.parse(await readFile('package.json','utf8'));
  assert.deepEqual(pkg.exports,PUBLIC_EXPORTS);
  assert.equal(pkg.exports['.'],undefined);
  assert.ok(pkg.files.includes('docs/'));
  assert.ok(pkg.files.includes('skills/'));
});

test('CLI/build implementation modules are not package exports',async()=>{
  const pkg=JSON.parse(await readFile('package.json','utf8'));
  for(const internal of[
    './operations','./api','./build','./mock-api','./mock-api/client',
    './project/check','./openapi/mutator','./init','./openapi/project-tools'
  ]) assert.equal(pkg.exports[internal],undefined,internal);
});

test('browser-safe project entry point does not import Node filesystem tooling',async()=>{
  const source=await readFile('project/index.js','utf8');
  assert.doesNotMatch(source,/node:fs|\.\/check\.js/);
  const check=await readFile('project/check.js','utf8');
  assert.match(check,/node:fs/);
});

test('core does not depend on editor packages',async()=>{
  const pkg=JSON.parse(await readFile('package.json','utf8'));
  const dependencies=Object.keys(pkg.dependencies||{});
  for(const forbidden of['rete','rete-area-plugin','@retejs/lit-plugin','monaco-editor','@scalar/openapi-parser'])assert.equal(dependencies.includes(forbidden),false);
});

test('static builder uses operation metadata and one canonical component runtime',async()=>{
  const source=await readFile('build/index.js','utf8');
  assert.match(source,/generateApiModule/);
  assert.match(source,/createRestClient/);
  assert.match(source,/components','index\.js'/);
  assert.doesNotMatch(source,/reactive\.js/);
  assert.doesNotMatch(source,/defaultDataSource/);
});

test('Core owns OpenAPI/project indexing used by development tools',async()=>{
  const openapi=await readFile('openapi/indexer.js','utf8');
  const project=await readFile('project/indexer.js','utf8');
  assert.match(openapi,/buildOpenApiIndex/);
  assert.match(project,/buildProjectIndex/);
  assert.match(project,/buildOpenApiIndex/);
});
