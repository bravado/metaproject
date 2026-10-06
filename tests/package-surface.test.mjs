import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const npm=process.platform==='win32'?'npm.cmd':'npm';
const root=path.resolve('.');

const retained=[
  'metaproject/components',
  'metaproject/data-source',
  'metaproject/compiler',
  'metaproject/compiler/browser',
  'metaproject/vite',
  'metaproject/openapi',
  'metaproject/project'
];

const internal=[
  'metaproject',
  'metaproject/operations',
  'metaproject/api',
  'metaproject/build',
  'metaproject/mock-api',
  'metaproject/mock-api/client',
  'metaproject/project/check',
  'metaproject/openapi/mutator',
  'metaproject/init',
  'metaproject/openapi/project-tools'
];

test('installed npm tarball exposes every retained public subpath and hides internal modules',()=>{
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'metaproject-package-surface-'));
  const packDir=path.join(temp,'pack');
  const consumer=path.join(temp,'consumer');
  fs.mkdirSync(packDir,{recursive:true});
  fs.mkdirSync(consumer,{recursive:true});
  fs.writeFileSync(path.join(consumer,'package.json'),JSON.stringify({name:'metaproject-surface-consumer',private:true,type:'module'}));

  try{
    const packed=spawnSync(npm,['pack','--json','--pack-destination',packDir],{cwd:root,encoding:'utf8'});
    assert.equal(packed.status,0,packed.stderr||packed.stdout);
    const metadata=JSON.parse(packed.stdout);
    const tarball=path.join(packDir,metadata[0].filename);

    const installed=spawnSync(npm,[
      'install','--ignore-scripts','--no-audit','--no-fund','--no-package-lock',tarball
    ],{cwd:consumer,encoding:'utf8'});
    assert.equal(installed.status,0,installed.stderr||installed.stdout);

    const script=`
      import assert from 'node:assert/strict';
      import { access } from 'node:fs/promises';

      const retained=${JSON.stringify(retained)};
      const internal=${JSON.stringify(internal)};

      for(const specifier of retained){
        const resolved=import.meta.resolve(specifier);
        assert.match(resolved,/node_modules\\/metaproject\\//,specifier);
        await access(new URL(resolved));
      }

      for(const specifier of internal){
        assert.throws(
          ()=>import.meta.resolve(specifier),
          error=>error?.code==='ERR_PACKAGE_PATH_NOT_EXPORTED',
          specifier
        );
      }

      for(const specifier of[
        'metaproject/data-source',
        'metaproject/compiler',
        'metaproject/vite',
        'metaproject/openapi',
        'metaproject/project'
      ]) await import(specifier);
    `;

    const verified=spawnSync(process.execPath,['--input-type=module','--eval',script],{cwd:consumer,encoding:'utf8'});
    assert.equal(verified.status,0,verified.stderr||verified.stdout);
  }finally{
    fs.rmSync(temp,{recursive:true,force:true});
  }
});
