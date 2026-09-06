import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('Metaproject exposes stable subpath imports for runtime and compiler', async () => {
  const pkg = JSON.parse(await readFile('package.json', 'utf8'));
  assert.equal(pkg.name, 'metaproject');
  assert.equal(pkg.exports['./components'], './components/reactive.js');
  assert.equal(pkg.exports['./compiler'], './compiler/index.js');
  assert.equal(pkg.exports['./compiler/browser'], './compiler/browser.js');
  assert.equal(pkg.exports['./api-client'], './api-client/index.js');
  assert.equal(pkg.exports['./openapi'], './openapi/index.js');
  assert.equal(pkg.exports['./openapi/mutator'], './openapi/mutator.js');
  assert.equal(pkg.exports['./openapi/project-tools'], './openapi/project-tools.js');
  assert.equal(pkg.exports['./mock-api'], './mock-api/index.js');
  assert.equal(pkg.exports['./build'], './build/index.js');
  assert.equal(pkg.bin.metaproject, './bin/metaproject.js');
});

test('Metaproject core does not depend on Canvas/editor packages', async () => {
  const pkg = JSON.parse(await readFile('package.json', 'utf8'));
  const dependencies = Object.keys(pkg.dependencies || {});
  for (const forbidden of ['rete','rete-area-plugin','@retejs/lit-plugin','monaco-editor','@scalar/openapi-parser']) {
    assert.equal(dependencies.includes(forbidden), false, `${forbidden} must stay in Canvas`);
  }
});

test('static project builder is part of Metaproject core, not Canvas', async () => {
  const source=await readFile('build/index.js','utf8');
  assert.match(source,/metaproject\.yaml/);
  assert.match(source,/api_root/);
  assert.match(source,/public\/components/);
  assert.match(source,/generateApiClientModule/);
});
