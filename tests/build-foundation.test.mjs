import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('static build owns API, runtime, component entries, index and manifest', async () => {
  const source=await readFile('build/index.js','utf8');
  assert.match(source,/entryPoints\.api/);
  assert.match(source,/entryPoints\.runtime/);
  assert.match(source,/entryPoints\[component\.tag\]/);
  assert.match(source,/entryPoints\.index/);
  assert.match(source,/manifest\.json/);
  assert.match(source,/bundle:true/);
  assert.match(source,/splitting:true/);
  assert.match(source,/format:'esm'/);
  assert.match(source,/assertBrowserNativeOutput/);
  assert.match(source,/assertOpenApiExamples\(project\.resolvedOpenApi\)/);
});

test('Metaproject package ships build dependency and agent skills', async () => {
  const pkg=JSON.parse(await readFile('package.json','utf8'));
  assert.equal(pkg.dependencies.esbuild,'^0.25.0');
  assert.ok(pkg.files.includes('skills/'));
  assert.equal(pkg.exports['./init'],'./init/index.js');
  const componentSkill=await readFile('skills/component-authoring/SKILL.md','utf8');
  const analysisSkill=await readFile('skills/application-analysis/SKILL.md','utf8');
  const creatorSkill=await readFile('skills/component-creator/SKILL.md','utf8');
  assert.match(componentSkill,/api\.<operationId>/);
  assert.match(componentSkill,/npx metaproject build/);
  assert.match(analysisSkill,/existing application/i);
  assert.match(analysisSkill,/component-creator\/SKILL\.md/);
  assert.match(creatorSkill,/straightforward/i);
});
