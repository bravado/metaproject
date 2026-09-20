import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('runtime and project tooling subpaths point at canonical Core implementations',async()=>{
  const pkg=JSON.parse(await readFile('package.json','utf8'));
  assert.equal(pkg.exports['./components'],'./components/index.js');
  assert.equal(pkg.exports['./data-source'],'./data-source/index.js');
  assert.equal(pkg.exports['./compiler'],'./compiler/index.js');
  assert.equal(pkg.exports['./operations'],'./operations/index.js');
  assert.equal(pkg.exports['./api'],'./api/index.js');
  assert.equal(pkg.exports['./openapi'],'./openapi/index.js');
  assert.equal(pkg.exports['./project'],'./project/index.js');
  assert.equal(pkg.exports['./project/check'],'./project/check.js');
  assert.ok(pkg.files.includes('api/'));
  assert.ok(pkg.files.includes('docs/'));
  assert.ok(pkg.files.includes('skills/'));
});

test('browser-safe project entry point does not import Node filesystem tooling',async()=>{
  const source=await readFile('project/index.js','utf8');
  assert.doesNotMatch(source,/node:fs|\.\/check\.js/);
  const check=await readFile('project/check.js','utf8');
  assert.match(check,/node:fs/);
});

test('core does not depend on Canvas/editor packages',async()=>{
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
