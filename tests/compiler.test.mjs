import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { parseComponentSource, splitLitTemplate, compileComponentModule, designTimeProperties, tagFromComponentPath } from '../compiler/index.js';

const detailSource=await readFile('tests/fixtures/components/user-detail/component.html','utf8');
const editSource=await readFile('tests/fixtures/components/user-edit/component.html','utf8');

test('HTML components infer metadata and declarative operation dependencies',()=>{
  const definition=parseComponentSource(detailSource,{tag:'user-detail',path:'components/user-detail/component.html'});
  assert.equal(definition.title,'User Details');
  assert.deepEqual(definition.properties.map(x=>x.name),['id']);
  assert.ok(definition.relationships.some(x=>x.type==='calls'&&x.target==='getUser'));
  assert.ok(definition.relationships.some(x=>x.type==='navigates-to'&&x.target==='user-edit'));
  assert.ok(definition.dependencies.includes('status-pill'));
});

test('data-operation becomes semantic operation metadata',()=>{
  const definition=parseComponentSource(editSource,{tag:'user-edit'});
  assert.ok(definition.relationships.some(x=>x.target==='getUser'));
  assert.ok(definition.relationships.some(x=>x.target==='updateUser'));
  assert.deepEqual(definition.actionOperations,[{event:'click',operationId:'updateUser'}]);
});

test('unsupported data-resource, direct api calls, save mapping, and actions arrays fail fast',()=>{
  assert.throws(()=>parseComponentSource('<data-resource></data-resource>',{tag:'user-detail'}),/<data-resource> is not supported/);
  assert.throws(()=>parseComponentSource('<data-table .resource=${api.listUsers()}></data-table>',{tag:'user-list'}),/direct api\.operationId\(\) calls are not supported/);
  assert.throws(()=>parseComponentSource('<data-source request="getUser" save="updateUser"></data-source>',{tag:'user-edit'}),/data-source save= is not supported/);
  assert.throws(()=>parseComponentSource('<data-table .actions=${[{name:\'open\'}]}></data-table>',{tag:'user-list'}),/data-table \.actions is not supported/);
});

test('native row templates remain static',()=>{
  const valid='<data-source request="listUsers"><data-table><table><tbody><template data-row><tr><td><data-label field="name"></data-label></td></tr></template></tbody></table></data-table></data-source>';
  assert.doesNotThrow(()=>parseComponentSource(valid,{tag:'user-list'}));
  const invalid='<data-table><table><tbody><template data-row><tr><td>${row.name}</td></tr></template></tbody></table></data-table>';
  assert.throws(()=>parseComponentSource(invalid,{tag:'user-list'}),/Lit expressions are not allowed inside <template data-row>/);
});

test('compiled modules only inject navigation runtime',()=>{
  const module=compileComponentModule({tag:'user-detail',source:detailSource,css:'h1{font-weight:700}'});
  assert.match(module,/class UserDetailElement extends LitElement/);
  assert.match(module,/const \{ navigate \} = metaprojectEnvironment\(\)/);
  assert.doesNotMatch(module,/DataSourceConsumerController/);
  assert.doesNotMatch(module,/const api =/);
  assert.doesNotMatch(module,/createProperty\('dataSource'/);
});

test('primitive component properties expose predictable standalone HTML attributes',()=>{
  const source=`
    <component-property name="dbName" type="string"></component-property>
    <component-property name="userId" type="integer" attribute="uid"></component-property>
    <component-property name="resource" type="User"></component-property>
    <component-property name="secret" type="string" attribute="false"></component-property>
  `;
  const module=compileComponentModule({tag:'sample-card',source});
  assert.match(module,/"dbName": \{ type:String, attribute:"db-name" \}/);
  assert.match(module,/"userId": \{ type:Number, attribute:"uid" \}/);
  assert.match(module,/"resource": \{ attribute:false \}/);
  assert.match(module,/"secret": \{ attribute:false \}/);
});

test('component tag inference works with a configured source directory not named components',()=>{
  assert.equal(tagFromComponentPath('/workspace/app/frontend/metaproject/user-card/component.html'),'user-card');
  assert.equal(tagFromComponentPath('ui/admin-table/component.html'),'admin-table');
});

test('Lit splitter preserves nested expressions',()=>{const source=`<div>\${items.map(item => html\`<b>\${item.name}</b>\`)}</div>`;const split=splitLitTemplate(source);assert.equal(split.expressions.length,1);});

test('design-time properties prefer examples and defaults',()=>{const definition=parseComponentSource('<component-property name="id" type="integer" example="7"></component-property><component-property name="dense" type="boolean" default="true"></component-property>',{tag:'user-card'});assert.deepEqual(designTimeProperties(definition),{id:7,dense:true});});

test('all bundled HTML fixtures compile to syntactically valid modules',async()=>{
  const root='tests/fixtures/components';const temp=await mkdtemp(join(tmpdir(),'metaproject-compile-'));
  try{for(const entry of await readdir(root,{withFileTypes:true})){if(!entry.isDirectory())continue;let source;try{source=await readFile(join(root,entry.name,'component.html'),'utf8');}catch{continue;}let css='';try{css=await readFile(join(root,entry.name,'style.css'),'utf8');}catch{}const code=compileComponentModule({tag:entry.name,source,css});const target=join(temp,`${entry.name}.mjs`);await writeFile(target,code);const result=spawnSync(process.execPath,['--check',target],{encoding:'utf8'});assert.equal(result.status,0,`${entry.name}: ${result.stderr}`);}}finally{await rm(temp,{recursive:true,force:true});}
});
