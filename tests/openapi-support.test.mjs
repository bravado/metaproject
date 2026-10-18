import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { parse as parseYaml } from 'yaml';
import {
  OpenApiSupportError,
  validateOpenApiSupport,
  resolveOpenApiRefs
} from '../openapi/index.js';
import { checkProject } from '../project/check.js';
import { loadProjectBuildContext } from '../build/index.js';

const fixtureRoot=path.join('tests','fixtures','openapi-support');
const read=name=>fs.readFileSync(path.join(fixtureRoot,name),'utf8');
const parse=name=>parseYaml(read(name));
const codes=items=>items.map(item=>item.code);
const bin=path.resolve('bin/metaproject.js');

test('OpenAPI 3.0.x and 3.1.x fixtures stay inside the supported subset',()=>{
  for(const name of ['supported-3.0.yaml','supported-3.1.yaml']){
    assert.deepEqual(validateOpenApiSupport(parse(name)),[],name);
  }
});

test('partial OpenAPI features are deterministic warnings rather than silent behavior',()=>{
  const diagnostics=validateOpenApiSupport(parse('partial-3.0.yaml'));
  assert.equal(diagnostics.every(item=>item.severity==='warning'),true);
  for(const code of [
    'partial-nullable-schema',
    'partial-urlencoded-request',
    'multiple-request-media-types',
    'multiple-response-media-types',
    'browser-cookie-security',
    'browser-mtls-security'
  ]) assert.ok(codes(diagnostics).includes(code),code);

  const nullable31=validateOpenApiSupport(parse('partial-3.1-nullable.yaml'));
  assert.deepEqual(codes(nullable31),['partial-nullable-schema']);
});

test('unsupported schema, serialization, callback, link, server and multipart constructs are errors',()=>{
  const diagnostics=validateOpenApiSupport(parse('unsupported.yaml'));
  assert.equal(diagnostics.filter(item=>item.severity==='warning').length,0);
  for(const code of [
    'unsupported-all-of',
    'unsupported-one-of',
    'unsupported-any-of',
    'unsupported-deep-object',
    'unsupported-object-parameter',
    'unsupported-parameter-explode',
    'unsupported-parameter-style',
    'unsupported-cookie-parameter',
    'unsupported-multipart-request',
    'unsupported-callbacks',
    'unsupported-response-links',
    'unsupported-scoped-servers'
  ]) assert.ok(codes(diagnostics).includes(code),code);
});

test('unsupported OpenAPI versions and remote refs are diagnosed explicitly',()=>{
  assert.deepEqual(codes(validateOpenApiSupport(parse('unsupported-version.yaml'))),['unsupported-openapi-version']);
  const remote=parse('unsupported-remote-ref.yaml');
  const diagnostics=validateOpenApiSupport(remote);
  assert.ok(codes(diagnostics).includes('unsupported-remote-ref'));
  assert.match(diagnostics.find(item=>item.code==='unsupported-remote-ref').path,/\$ref$/);
  assert.throws(
    ()=>resolveOpenApiRefs(remote,{sourcePath:'openapi.yaml',readFile:()=>{throw new Error('must not fetch');},parseDocument:parseYaml}),
    /Remote OpenAPI \$ref is not supported/
  );
});

test('project-relative external refs resolve and remain supported',()=>{
  const root=parse('external/openapi.yaml');
  const resolved=resolveOpenApiRefs(root,{
    sourcePath:'openapi.yaml',
    readFile:ref=>fs.readFileSync(path.join(fixtureRoot,'external',ref),'utf8'),
    parseDocument:source=>parseYaml(source)
  });
  assert.equal(resolved.components.schemas.User['x-source-ref'],'./schemas.yaml#/User');
  assert.equal(resolved.components.schemas.User.type,'object');
  assert.deepEqual(validateOpenApiSupport(resolved),[]);
});

test('metaproject check surfaces support errors and build context rejects them',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'metaproject-openapi-support-'));
  try{
    fs.mkdirSync(path.join(root,'components'),{recursive:true});
    fs.writeFileSync(path.join(root,'metaproject.yaml'),'version: 1\nname: Support fixture\nopenapi: openapi.yaml\n');
    fs.writeFileSync(path.join(root,'openapi.yaml'),read('unsupported.yaml'));

    const result=checkProject({root});
    assert.ok(result.errors.some(item=>item.code==='unsupported-deep-object'));
    assert.ok(result.errors.some(item=>item.code==='unsupported-all-of'));
    assert.ok(result.errors.find(item=>item.code==='unsupported-deep-object').path.startsWith('/paths/'));

    assert.throws(
      ()=>loadProjectBuildContext(root),
      error=>error instanceof OpenApiSupportError && error.diagnostics.some(item=>item.code==='unsupported-multipart-request')
    );

    const cli=spawnSync(process.execPath,[bin,'check',root],{encoding:'utf8'});
    assert.equal(cli.status,1);
    assert.match(cli.stdout,/ERROR unsupported-deep-object \/paths\//);
  }finally{
    fs.rmSync(root,{recursive:true,force:true});
  }
});

test('support warnings do not block project loading',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'metaproject-openapi-warning-'));
  try{
    fs.writeFileSync(path.join(root,'metaproject.yaml'),'version: 1\nname: Warning fixture\nopenapi: openapi.yaml\n');
    fs.writeFileSync(path.join(root,'openapi.yaml'),read('partial-3.0.yaml'));
    const context=loadProjectBuildContext(root);
    assert.ok(context.supportDiagnostics.some(item=>item.code==='partial-urlencoded-request'));
    assert.equal(context.supportDiagnostics.some(item=>item.severity==='error'),false);
  }finally{
    fs.rmSync(root,{recursive:true,force:true});
  }
});
