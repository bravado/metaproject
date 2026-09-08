import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const bootstrap=await readFile('skills/project-bootstrap/SKILL.md','utf8');
const analysis=await readFile('skills/application-analysis/SKILL.md','utf8');
const importing=await readFile('skills/openapi-import/SKILL.md','utf8');
const creator=await readFile('skills/component-creator/SKILL.md','utf8');
const authoring=await readFile('skills/component-authoring/SKILL.md','utf8');

test('skills cover new projects, existing code, existing OpenAPI, and component creation',()=>{
  assert.match(bootstrap,/from scratch/i);
  assert.match(bootstrap,/OpenAPI/);
  assert.match(analysis,/existing application/i);
  assert.match(analysis,/route\/router definitions/i);
  assert.match(analysis,/controllers\/handlers\/actions/i);
  assert.match(importing,/import-openapi/);
  assert.match(importing,/multi-file/i);
  assert.match(creator,/reusable Web Components/i);
  assert.match(authoring,/host application/i);
});

test('application-analysis models OpenAPI first and hands off to component creation',()=>{
  assert.match(analysis,/browser-facing HTTP capabilities/i);
  assert.match(analysis,/openapi upsert-operation/);
  assert.match(analysis,/openapi check-examples/);
  assert.match(analysis,/skills\/component-creator\/SKILL\.md/);
});

test('component skills teach the declarative primitive API',()=>{
  for(const source of [creator,authoring]){
    assert.match(source,/data-source/);
    assert.match(source,/data-table/);
    assert.match(source,/data-form/);
    assert.doesNotMatch(source,/\bapi\.[A-Za-z_$][\w$]*\s*\(/);
    assert.doesNotMatch(source,/data-resource/);
  }
  assert.match(creator,/multiple `<data-source>`/i);
  assert.match(authoring,/flat parameter/i);
  assert.match(authoring,/path\/query\/header/i);
  assert.match(authoring,/kebab-case HTML attributes/i);
});

test('Core skills keep Canvas optional rather than making it the component runtime',()=>{
  const combined=[bootstrap,analysis,importing,creator,authoring].join('\n');
  assert.match(combined,/Canvas is optional|Canvas.*optional/i);
  assert.match(combined,/components must not depend on Canvas|Canvas.*not.*runtime/i);
  assert.doesNotMatch(combined,/views\//i);
});
