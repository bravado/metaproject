import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root=path.resolve('.');
const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
const readme=fs.readFileSync(path.join(root,'README.md'),'utf8');

const retained=[
  './components',
  './data-source',
  './compiler',
  './compiler/browser',
  './vite',
  './openapi',
  './project'
];

const internal=[
  '.',
  './operations',
  './api',
  './build',
  './mock-api',
  './mock-api/client',
  './project/check',
  './openapi/mutator',
  './init',
  './openapi/project-tools'
];

test('package engines and documentation agree on the Node 0.11.x baseline',()=>{
  assert.equal(pkg.engines.node,'>=22.12.0');
  assert.match(readme,/Node\.js \*\*22\.12\.0 and newer maintained releases\*\*/);
  assert.match(readme,/exact minimum \(22\.12\.0\), Node 24 LTS, and the current Node 26 line/);
});

test('package exports remain limited to the documented public surface',()=>{
  assert.deepEqual(Object.keys(pkg.exports).sort(),retained.sort());
  for(const specifier of internal) assert.equal(pkg.exports[specifier],undefined,specifier);
});
