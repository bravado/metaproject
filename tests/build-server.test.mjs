import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadProjectBuildContext } from '../build/index.js';

async function fixture(metaproject,openapi){
  const root=await mkdtemp(join(tmpdir(),'metaproject-server-'));
  await mkdir(join(root,'components'));
  await writeFile(join(root,'metaproject.yaml'),metaproject);
  await writeFile(join(root,'openapi.yaml'),openapi);
  return root;
}

test('static build derives its default API root from the first OpenAPI server',async()=>{
  const root=await fixture(
    'version: 1\nname: Example\nopenapi: openapi.yaml\ncomponents:\n  source: components\n  output: public/components\n',
    'openapi: 3.1.0\ninfo:\n  title: Example\n  version: 1.0.0\nservers:\n  - url: https://api.example.test/{version}\n    variables:\n      version:\n        default: v2\npaths: {}\n'
  );
  try{
    assert.equal(loadProjectBuildContext(root).apiRoot,'https://api.example.test/v2');
  }finally{await rm(root,{recursive:true,force:true});}
});

