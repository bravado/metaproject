import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(path,'utf8');

test('README presents Metaproject as API-to-Web-Components glue and covers all adoption paths',async()=>{
  const source=await read('README.md');
  assert.match(source,/glue between your HTTP API and reusable Web Components/i);
  assert.match(source,/New project/);
  assert.match(source,/Existing application with an OpenAPI contract/);
  assert.match(source,/Existing application without a sufficient API spec/);
  assert.match(source,/metaproject check/);
  assert.match(source,/upsert-schema/);
  assert.doesNotMatch(source,/upsert-entity/);
  assert.match(source,/Core data-source/);
  assert.match(source,/ordinary browser custom elements/i);
});

test('package ships focused architecture, adoption, runtime, and host integration docs',async()=>{
  const architecture=await read('docs/architecture.md');
  const scratch=await read('docs/getting-started.md');
  const existing=await read('docs/adopting-existing-application.md');
  const dataSource=await read('docs/data-source.md');
  const using=await read('docs/using-components.md');
  const apiCli=await read('docs/api-cli.md');
  assert.match(architecture,/OpenAPI is the API boundary/i);
  assert.match(scratch,/Getting started from scratch/);
  assert.match(scratch,/upsert-schema/);
  assert.doesNotMatch(scratch,/upsert-entity/);
  assert.match(existing,/Add Metaproject to an existing application/);
  assert.match(existing,/import-openapi/);
  assert.match(dataSource,/Shared runtime and cache/);
  assert.match(dataSource,/in-flight request/);
  assert.match(dataSource,/Mutation invalidation/);
  assert.match(using,/Plain HTML/);
  assert.match(using,/Plain JavaScript/);
  assert.match(using,/Lit/);
  assert.match(using,/React, Vue, Svelte/);
  assert.match(using,/data-action/);
  assert.match(apiCli,/api call/);
  assert.match(apiCli,/operationId/);
  assert.match(apiCli,/--server/);
});
