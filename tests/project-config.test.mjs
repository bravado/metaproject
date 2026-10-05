import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { METAPROJECT_SCHEMA, MetaprojectConfigError, parseMetaprojectConfig } from '../project/config.js';

const bin=path.resolve('bin/metaproject.js');
const fixture=name=>fs.readFileSync(path.join('tests','fixtures','config',name),'utf8');

test('shipped schema accepts the complete supported metaproject.yaml fixture',()=>{
  const config=parseMetaprojectConfig(fixture('valid-full.yaml'));
  assert.equal(config.version,1);
  assert.equal(config.scope,'fixture.api');
  assert.equal(config.components.output_api,'public/metaproject/api.generated.js');
  assert.equal(config.build.minify,true);
  assert.equal(METAPROJECT_SCHEMA.additionalProperties,false);
  assert.equal(METAPROJECT_SCHEMA.properties.components.additionalProperties,false);
  assert.equal(METAPROJECT_SCHEMA.properties.build.additionalProperties,false);
});

test('unknown top-level and nested fields report their configuration paths',()=>{
  assert.throws(
    ()=>parseMetaprojectConfig(fixture('invalid-unknown.yaml')),
    error=>{
      assert.ok(error instanceof MetaprojectConfigError);
      assert.deepEqual(error.diagnostics.map(item=>item.path),[
        'opneapi',
        'components.outpt',
        'build.sourcemaps'
      ]);
      assert.match(error.message,/components\.outpt: unknown configuration field/);
      assert.match(error.message,/Supported fields: source, output, output_api/);
      return true;
    }
  );
});

test('api_root is rejected with OpenAPI servers migration guidance',()=>{
  assert.throws(
    ()=>parseMetaprojectConfig(fixture('invalid-api-root.yaml')),
    error=>{
      assert.ok(error instanceof MetaprojectConfigError);
      assert.equal(error.diagnostics[0].path,'api_root');
      assert.match(error.message,/api_root was removed.*OpenAPI servers list/i);
      return true;
    }
  );
});

test('schema rejects unsupported version, scope, and build value types',()=>{
  assert.throws(
    ()=>parseMetaprojectConfig(fixture('invalid-types.yaml')),
    error=>{
      assert.ok(error instanceof MetaprojectConfigError);
      assert.ok(error.diagnostics.some(item=>item.path==='version' && /integer/.test(item.message)));
      assert.ok(error.diagnostics.some(item=>item.path==='scope' && /lowercase identifier/.test(item.message)));
      assert.ok(error.diagnostics.some(item=>item.path==='build.minify' && /boolean/.test(item.message)));
      assert.ok(error.diagnostics.some(item=>item.path==='build.sourcemap' && /boolean/.test(item.message)));
      return true;
    }
  );
});

test('version is required so the configuration contract can evolve deterministically',()=>{
  assert.throws(
    ()=>parseMetaprojectConfig('name: Missing version\n'),
    error=>error instanceof MetaprojectConfigError && error.diagnostics.some(item=>item.path==='version' && /required/.test(item.message))
  );
});

test('CLI check and build both validate configuration before project processing',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'metaproject-config-cli-'));
  try {
    fs.writeFileSync(path.join(root,'metaproject.yaml'),fixture('invalid-unknown.yaml'));
    for(const command of ['check','build']) {
      const result=spawnSync(process.execPath,[bin,command,root],{encoding:'utf8'});
      assert.equal(result.status,1,`${command} unexpectedly succeeded: ${result.stdout}`);
      assert.match(result.stderr,/components\.outpt: unknown configuration field/);
      assert.match(result.stderr,/build\.sourcemaps: unknown configuration field/);
      assert.doesNotMatch(result.stderr,/\n\s+at /);
    }
  } finally {
    fs.rmSync(root,{recursive:true,force:true});
  }
});
