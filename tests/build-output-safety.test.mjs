import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildProject, buildProjectApiModule, buildProjectComponents } from '../build/index.js';
import { checkProject } from '../project/check.js';
import { spawnSync } from 'node:child_process';

function fixture(output='public/components',additionalConfig=''){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'metaproject-safe-output-'));
  fs.mkdirSync(path.join(root,'components','user-list'),{recursive:true});
  fs.writeFileSync(path.join(root,'components','user-list','component.html'),'<title>Users</title><data-source request="listUsers"><data-table></data-table></data-source>');
  fs.writeFileSync(path.join(root,'openapi.yaml'),`openapi: 3.1.0
info: { title: Safe build, version: '1' }
servers:
  - url: /api
paths:
  /users:
    get:
      operationId: listUsers
      responses:
        '200':
          description: Users
          content:
            application/json:
              schema: {type: array, items: {type: object}}
              example: [{id: 1}]
`);
  fs.writeFileSync(path.join(root,'metaproject.yaml'),`version: 1
openapi: openapi.yaml
components:
  source: components
  output: ${output}
${additionalConfig}`);
  fs.writeFileSync(path.join(root,'keep.txt'),'do not delete\n');
  return root;
}
async function withFixture(fn,output='public/components',additionalConfig=''){
  const root=fixture(output,additionalConfig);
  try{await fn(root);}
  finally{fs.rmSync(root,{recursive:true,force:true});}
}
function pathsAt(root,dir='public/components'){
  return path.join(root,dir);
}
function setOutput(root,out,more=''){
  fs.writeFileSync(path.join(root,'metaproject.yaml'),`version: 1
openapi: openapi.yaml
components:
  source: components
  output: ${out}
${more}`);
}
function ensureUnchanged(root){
  assert.equal(fs.readFileSync(path.join(root,'keep.txt'),'utf8'),'do not delete\n');
  assert.ok(fs.existsSync(path.join(root,'openapi.yaml')));
  assert.ok(fs.existsSync(path.join(root,'components','user-list','component.html')));
  assert.ok(fs.existsSync(path.join(root,'metaproject.yaml')));
}

test('refuses project root and component source as generated destinations without touching source',async()=>{
  for(const dest of ['.','components','components/user-list']){
    await withFixture(async(root)=>{
      await assert.rejects(buildProject({root}),/Unsafe Metaproject output path components.output: overlaps|cannot be the project root/);
      ensureUnchanged(root);
    },dest);
  }
});

test('refuses output that includes OpenAPI or configuration files',async()=>{
  for(const spec of [
    ['.', 'cannot be the project root'],
    ['docs','overlaps openapi']
  ]){
    await withFixture(async(root)=>{
      if(spec[0]==='docs'){
        fs.mkdirSync(path.join(root,'docs'));
        fs.renameSync(path.join(root,'openapi.yaml'),path.join(root,'docs','openapi.yaml'));
        fs.writeFileSync(path.join(root,'metaproject.yaml'),`version: 1
openapi: docs/openapi.yaml
components:
  source: components
  output: docs
`);
      }
      await assert.rejects(buildProject({root}),new RegExp(spec[1]));
      assert.equal(fs.readFileSync(path.join(root,'keep.txt'),'utf8'),'do not delete\n');
    },spec[0]);
  }
});

test('refuses API output outside generated directory and reserved module names',async()=>{
  for(const api of ['openapi.yaml','components/user-list/component.html','public/components/index.js','public/components/user-list.js','public/components/index.js/nested.js','public/components/api.js/nested.js','../outside.js']){
    await withFixture(async(root)=>{
      setOutput(root,'public/components',`  output_api: ${api}\n`);
      await assert.rejects(buildProject({root}),/Unsafe Metaproject output path components.output_api/);
      ensureUnchanged(root);
      assert.equal(fs.existsSync(pathsAt(root)),false);
    });
  }
});

test('refuses output symlink and symlinked parent without touching external files',async()=>{
  const external=fs.mkdtempSync(path.join(os.tmpdir(),'metaproject-outside-'));
  try {
    const sentinel=path.join(external,'sentinel.txt');
    fs.writeFileSync(sentinel,'external data');
    for(const viaParent of [false,true]){
      await withFixture(async(root)=>{
        fs.mkdirSync(path.join(root,'public'),{recursive:true});
        if(viaParent){
          fs.symlinkSync(external,path.join(root,'public','linked'),'dir');
          setOutput(root,'public/linked/components');
        }else{
          fs.symlinkSync(external,path.join(root,'public','components'),'dir');
        }
        await assert.rejects(buildProject({root}),/symbolic link|Unsafe Metaproject output path/);
        assert.equal(fs.readFileSync(sentinel,'utf8'),'external data');
        ensureUnchanged(root);
      });
    }
  }finally{fs.rmSync(external,{recursive:true,force:true});}
});

test('refuses symlinked component source aliasing generated output',async()=>{
  await withFixture(async(root)=>{
    fs.rmSync(path.join(root,'components'),{recursive:true});
    fs.mkdirSync(path.join(root,'public','components'),{recursive:true});
    fs.symlinkSync(path.join(root,'public','components'),path.join(root,'components'),'dir');
    await assert.rejects(buildProject({root}),/overlaps components.source/);
    assert.equal(fs.readFileSync(path.join(root,'keep.txt'),'utf8'),'do not delete\n');
  });
});

test('refuses unowned output files and unrecognized files added to previously generated output',async()=>{
  await withFixture(async(root)=>{
    const output=pathsAt(root);
    fs.mkdirSync(output,{recursive:true});
    fs.writeFileSync(path.join(output,'app.js'),'handwritten');
    await assert.rejects(buildProject({root}),/without a Metaproject manifest/);
    assert.equal(fs.readFileSync(path.join(output,'app.js'),'utf8'),'handwritten');
    fs.rmSync(path.join(output,'app.js'));
    await buildProject({root});
    fs.writeFileSync(path.join(output,'notes.txt'),'user data');
    await assert.rejects(buildProject({root}),/unrecognized or linked file notes.txt/);
    assert.equal(fs.readFileSync(path.join(output,'notes.txt'),'utf8'),'user data');
    ensureUnchanged(root);
  });
});

test('staging preserves the last completed generated output when compilation fails',async()=>{
  await withFixture(async(root)=>{
    const output=pathsAt(root);
    await buildProject({root});
    const before=new Map(fs.readdirSync(output).map(file=>[file,fs.readFileSync(path.join(output,file))]));
    fs.writeFileSync(path.join(root,'components','user-list','component.js'),'export const = ;');
    await assert.rejects(buildProject({root}));
    assert.deepEqual(fs.readdirSync(output).sort(),[...before.keys()].sort());
    for(const [file,bytes] of before)assert.deepEqual(fs.readFileSync(path.join(output,file)),bytes,file);
    assert.deepEqual(fs.readdirSync(path.join(root,'public')).filter(x=>x.startsWith('.metaproject-stage-')),[]);
    ensureUnchanged(root);
  });
});

test('build and rebuild accept a safe custom output and custom generated API file',async()=>{
  await withFixture(async(root)=>{
    setOutput(root,'dist/assets','  output_api: dist/assets/metadata/api.generated.js\n');
    const first=await buildProject({root});
    const out=pathsAt(root,'dist/assets');
    assert.equal(first.api.outputPath,'dist/assets/metadata/api.generated.js');
    assert.ok(fs.existsSync(path.join(out,'api.js')));
    assert.ok(fs.existsSync(path.join(out,'metadata','api.generated.js')));
    assert.deepEqual(fs.readFileSync(path.join(out,'api.js')),fs.readFileSync(path.join(out,'metadata','api.generated.js')));
    const manifest=JSON.parse(fs.readFileSync(path.join(out,'manifest.json'),'utf8'));
    assert.equal(manifest.outputApi,'metadata/api.generated.js');
    await buildProject({root});
    ensureUnchanged(root);
    assert.deepEqual(fs.readdirSync(path.join(root,'dist')).filter(x=>x.startsWith('.metaproject-backup-')||x.startsWith('.metaproject-stage-')),[]);
  });
});

test('independent component and API builders enforce the same safety checks',async()=>{
  await withFixture(async(root)=>{
    setOutput(root,'.');
    await assert.rejects(buildProjectComponents({root}),/cannot be the project root/);
    assert.throws(()=>buildProjectApiModule({root}),/cannot be the project root/);
    ensureUnchanged(root);
  });
});

test('metaproject check detects unsafe output before build and reports a concise path error',async()=>{
  await withFixture(async(root)=>{
    setOutput(root,'.');
    assert.throws(()=>checkProject({root}),/Unsafe Metaproject output path components.output: cannot be the project root/);
    const result=spawnSync(process.execPath,[path.resolve('bin/metaproject.js'),'check',root],{encoding:'utf8'});
    assert.equal(result.status,1);
    assert.match(result.stderr,/Unsafe Metaproject output path components.output/);
    assert.doesNotMatch(result.stderr,/\\n\\s+at /);
    ensureUnchanged(root);
  });
});
