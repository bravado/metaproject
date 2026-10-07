import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { metaproject } from 'metaproject/vite';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const bin=path.join(root,'bin','metaproject.js');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'metaproject-examples-'));

try {
  for(const name of ['vanilla','existing-app']){
    const source=path.join(root,'examples',name);
    const target=path.join(temp,name);
    fs.cpSync(source,target,{recursive:true});
    runCli(['check',target]);
    runCli(['build',target]);
    assertGenerated(target);
  }

  const remoteSource=path.join(root,'examples','remote-component');
  const remoteTarget=path.join(temp,'remote-component');
  fs.cpSync(remoteSource,remoteTarget,{recursive:true});
  for(const project of ['host','remote']){
    const projectRoot=path.join(remoteTarget,project);
    runCli(['check',projectRoot]);
    runCli(['build',projectRoot]);
    assertGenerated(projectRoot);
  }
  assert.ok(fs.existsSync(path.join(remoteTarget,'remote','public','components','invoice-list.js')));

  for(const file of [
    'examples/vanilla/server.mjs',
    'examples/remote-component/server.mjs',
    'examples/existing-app/server.mjs',
    'examples/vite/vite.config.js',
    'examples/vite/src/main.js'
  ]) {
    const result=spawnSync(process.execPath,['--check',path.join(root,file)],{encoding:'utf8'});
    assert.equal(result.status,0,result.stderr);
  }

  const viteRoot=path.join(temp,'vite');
  fs.cpSync(path.join(root,'examples','vite'),viteRoot,{recursive:true});
  const plugin=metaproject();
  plugin.configResolved({root:viteRoot});

  const registryId=plugin.resolveId('metaproject:components');
  assert.equal(typeof registryId,'string');
  const registry=plugin.load(registryId);
  assert.match(registry,/metaproject:component\/status-card/);

  const componentId=plugin.resolveId('metaproject:component/status-card');
  assert.equal(typeof componentId,'string');
  const componentSource=plugin.load(componentId);
  assert.match(componentSource,/class StatusCardElement extends LitElement/);
  assert.match(componentSource,/customElements\.define\("status-card"/);

  const viteConfig=fs.readFileSync(path.join(root,'examples','vite','vite.config.js'),'utf8');
  assert.match(viteConfig,/from 'metaproject\/vite'/);
  const viteMain=fs.readFileSync(path.join(root,'examples','vite','src','main.js'),'utf8');
  assert.match(viteMain,/import 'metaproject:components'/);

  console.log('Product examples verified.');
} finally {
  fs.rmSync(temp,{recursive:true,force:true});
}

function runCli(args){
  const result=spawnSync(process.execPath,[bin,...args],{encoding:'utf8'});
  assert.equal(
    result.status,
    0,
    [`Command failed: metaproject ${args.join(' ')}`,result.stdout,result.stderr].filter(Boolean).join('\n')
  );
  return result;
}

function assertGenerated(projectRoot){
  const output=path.join(projectRoot,'public','components');
  for(const name of ['index.js','all.js','api.js','manifest.json']){
    assert.ok(fs.existsSync(path.join(output,name)),`Expected generated ${name} in ${projectRoot}`);
  }
}
