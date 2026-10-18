import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('static build emits one host runtime and standalone components',async()=>{
  const source=await readFile('build/index.js','utf8');
  assert.match(source,/generateApiModule/);
  assert.match(source,/runtimeEntrySource/);
  assert.match(source,/componentResolver/);
  assert.match(source,/manifest\.json/);
  assert.match(source,/registerMetaprojectScope/);
  assert.match(source,/createRestClient/);
  assert.match(source,/const scopes=new Map/);
  assert.doesNotMatch(source,/defaultDataSource/);
  assert.doesNotMatch(source,/createDataSource/);
  assert.match(source,/bundle:true/);
  assert.match(source,/globalThis\[runtimeSymbol\]/);
  assert.match(source,/splitting:false/);
  assert.match(source,/assertOpenApiExamples\(project\.resolvedOpenApi\)/);
});

test('authoring skills teach the lean portable primitives',async()=>{
  const authoring=await readFile('skills/component-authoring/SKILL.md','utf8');
  const creator=await readFile('skills/component-creator/SKILL.md','utf8');
  assert.match(authoring,/<data-source>/);
  assert.match(authoring,/<data-table>/);
  assert.match(authoring,/<data-form>/);
  assert.match(authoring,/OpenAPI `operationId`/);
  assert.doesNotMatch(authoring,/\bapi\.[A-Za-z_$][\w$]*\s*\(/);
  assert.doesNotMatch(authoring,/data-resource/);
  assert.match(creator,/multiple `<data-source>`/i);
  assert.match(creator,/reusable Web Components/i);
});
