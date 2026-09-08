import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const analysis=await readFile('skills/application-analysis/SKILL.md','utf8');
const creator=await readFile('skills/component-creator/SKILL.md','utf8');
const authoring=await readFile('skills/component-authoring/SKILL.md','utf8');

test('application-analysis models OpenAPI first and hands off to component creation',()=>{
  assert.match(analysis,/openapi\.yaml.*canonical/is);
  assert.match(analysis,/openapi upsert-operation/);
  assert.match(analysis,/openapi check-examples/);
  assert.match(analysis,/skills\/component-creator\/SKILL\.md/);
});

test('component skills teach the declarative primitive API',()=>{
  for(const source of [creator,authoring]){
    assert.match(source,/data-source/);
    assert.match(source,/data-table/);
    assert.match(source,/data-form/);
    assert.doesNotMatch(source,/api\.<operationId>/);
    assert.doesNotMatch(source,/data-resource/);
  }
  assert.match(creator,/multiple data-sources/i);
  assert.match(authoring,/flat attributes/i);
});

test('skills describe only core Metaproject concepts',()=>{
  for(const source of [analysis,creator,authoring]){
    assert.doesNotMatch(source,/\bcanvas\b/i);
    assert.doesNotMatch(source,/views\//i);
  }
});
