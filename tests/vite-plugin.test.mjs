import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const plugin=await readFile('vite/index.js','utf8');
const compiler=await readFile('compiler/index.js','utf8');

test('Vite plugin exposes project-wide and per-component virtual imports',()=>{
  assert.match(plugin,/id === 'metaproject:components'/);
  assert.match(plugin,/metaproject:component\//);
  assert.match(plugin,/compileComponentModule/);
  assert.match(plugin,/component\.html/);
});

test('compiler output depends only on Lit and the small Metaproject components package',()=>{
  assert.match(compiler, /from 'lit'/);
  assert.match(compiler, /from 'metaproject\/components'/);
  assert.doesNotMatch(compiler,/rete|monaco|openapi-parser/);
});
