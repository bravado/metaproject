import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const analysis = await readFile('skills/application-analysis/SKILL.md','utf8');
const creator = await readFile('skills/component-creator/SKILL.md','utf8');
const authoring = await readFile('skills/component-authoring/SKILL.md','utf8');

test('application-analysis models OpenAPI first, requires examples, and hands off to component creation', () => {
  assert.match(analysis,/openapi\.yaml.*canonical/is);
  assert.match(analysis,/openapi upsert-operation/);
  assert.match(analysis,/openapi upsert-entity/);
  assert.match(analysis,/import-openapi/);
  assert.match(analysis,/openapi check-examples/);
  assert.match(analysis,/collection response: normally 2 representative records/i);
  assert.match(analysis,/skills\/component-creator\/SKILL\.md/);
});

test('component-creator creates a minimal showcase-ready UX from OpenAPI', () => {
  assert.match(creator,/smallest useful UX/i);
  assert.match(creator,/showcase-ready/i);
  assert.match(creator,/api\.<operationId>/);
  assert.match(creator,/component-property.*example/i);
  assert.match(creator,/data-action/);
  assert.match(creator,/openapi check-examples/);
});

test('skills describe only core Metaproject concepts and do not depend on the Canvas application', () => {
  for (const source of [analysis, creator, authoring]) {
    assert.doesNotMatch(source,/\bcanvas\b/i);
    assert.doesNotMatch(source,/views\//i);
  }
});
