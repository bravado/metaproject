import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const bootstrap=await readFile('skills/project-bootstrap/SKILL.md','utf8');
const analysis=await readFile('skills/application-analysis/SKILL.md','utf8');
const importing=await readFile('skills/openapi-import/SKILL.md','utf8');
const creator=await readFile('skills/component-creator/SKILL.md','utf8');
const authoring=await readFile('skills/component-authoring/SKILL.md','utf8');
const workflow=await readFile('docs/openapi-component-workflow.md','utf8');

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
  assert.match(analysis,/openapi upsert-schema/);
  assert.doesNotMatch([bootstrap,analysis].join('\n'),/upsert-entity/);
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

test('component-creator preserves existing component contracts on rerun',()=>{
  assert.match(creator,/inspect existing component HTML, CSS, JavaScript\/TypeScript, public properties, semantic `data-action` events/i);
  assert.match(creator,/reuse or extend an existing component/i);
  assert.match(creator,/smallest change required/i);
  assert.match(creator,/preserve hand-written markup, styles, helper logic, public properties, semantic events/i);
  assert.match(creator,/never replace an existing component wholesale/i);
});

test('component-creator never invents API operations and groups by workflow',()=>{
  assert.match(creator,/Never invent an OpenAPI operation or operationId/i);
  assert.match(creator,/already exists in the configured OpenAPI contract/i);
  assert.match(creator,/coherent domain\/workflow components over one component per OpenAPI operation/i);
  assert.match(creator,/Operations are implementation capabilities, not component boundaries/i);
});

test('component-creator defines behavior for evolving operations',()=>{
  assert.match(creator,/operation added:/i);
  assert.match(creator,/operation changed:/i);
  assert.match(creator,/operation renamed with the same behavior:/i);
  assert.match(creator,/operation removed:/i);
  assert.match(creator,/response\/schema changed:/i);
  assert.match(creator,/do not invent one; report the contract\/component mismatch/i);
});

test('application-analysis performs focused contract updates on rerun',()=>{
  assert.match(analysis,/classify each as \*\*current\*\*, \*\*missing\*\*, or \*\*stale\*\*/i);
  assert.match(analysis,/leave current operations and schemas unchanged/i);
  assert.match(analysis,/add only missing browser-facing capabilities/i);
  assert.match(analysis,/update only stale fields/i);
  assert.match(analysis,/preserve existing stable `operationId` and `x-project-id` values/i);
  assert.match(analysis,/do not broadly regenerate or reformat the whole OpenAPI document/i);
});

test('OpenAPI import preserves stable IDs and authoritative multi-file structure',()=>{
  assert.match(importing,/Preserve existing `operationId` values/i);
  assert.match(importing,/Do not rename stable operation IDs/i);
  assert.match(importing,/authoritative contract is intentionally multi-file/i);
  assert.match(importing,/Do not flatten or copy a multi-file contract/i);
  assert.match(importing,/do not force-replace it as a routine rerun/i);
});

test('documented OpenAPI to component workflow demonstrates preservation',()=>{
  assert.match(workflow,/listUsers/);
  assert.match(workflow,/getUser/);
  assert.match(workflow,/updateUser/);
  assert.match(workflow,/do not imply three components/i);
  assert.match(workflow,/must not invent an operation such as `archiveUser`/i);
  assert.match(workflow,/public `id` property and `edit` semantic event are component contracts/i);
  assert.match(workflow,/hand-written markup, CSS, helper JavaScript/i);
  assert.match(workflow,/report that the editor's required capability is no longer modeled/i);
});

test('Core skills keep generated components independent of host-specific routing and layout',()=>{
  const combined=[bootstrap,analysis,importing,creator,authoring].join('\n');
  assert.match(combined,/application routing|routing, page layout|routing\/layout/i);
  assert.doesNotMatch(combined,/views\//i);
});
