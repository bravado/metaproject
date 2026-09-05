import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseComponentSource, splitLitTemplate, compileComponentModule, designTimeProperties } from '../compiler/index.js';

const detailSource = await readFile('tests/fixtures/components/user-detail/component.html','utf8');
const editSource = await readFile('tests/fixtures/components/user-edit/component.html','utf8');

test('HTML components infer tag contract without an outer template wrapper', () => {
  const definition=parseComponentSource(detailSource,{tag:'user-detail',path:'components/user-detail/component.html'});
  assert.equal(definition.title,'User Details');
  assert.deepEqual(definition.properties.map(x=>x.name),['id']);
  assert.equal(definition.properties[0].example,1);
  assert.ok(!definition.body.includes('<title>'));
  assert.ok(!definition.body.includes('<component-property'));
  assert.match(definition.body,/<data-source/);
  assert.deepEqual(definition.actions.sort(),['edit']);
  assert.ok(definition.dependencies.includes('status-pill'));
});

test('component dependency analysis produces API and component navigation edges', () => {
  const definition=parseComponentSource(detailSource,{tag:'user-detail'});
  assert.ok(definition.relationships.some(x=>x.type==='calls'&&x.target==='getUser'));
  assert.ok(!definition.relationships.some(x=>x.type==='calls'&&x.target==='updateUser'));
  assert.ok(definition.relationships.some(x=>x.type==='navigates-to'&&x.target==='user-edit'));
});


test('edit component owns the update operation and form controls remain built-ins', () => {
  const definition=parseComponentSource(editSource,{tag:'user-edit'});
  assert.ok(definition.relationships.some(x=>x.type==='calls'&&x.target==='getUser'));
  assert.ok(definition.relationships.some(x=>x.type==='calls'&&x.target==='updateUser'));
  assert.deepEqual(definition.actions,['save']);
  assert.ok(!definition.dependencies.some(tag=>tag.startsWith('form-')));
});

test('Lit splitter preserves nested template expressions', () => {
  const source=`<div>\${items.map(item => html\`<b>\${item.name}</b>\`)}</div>`;
  const split=splitLitTemplate(source);
  assert.equal(split.expressions.length,1);
  assert.match(split.expressions[0],/html`<b>\$\{item\.name\}<\/b>`/);
});

test('native row templates are static and dynamic handlers belong on data-table', () => {
  const valid=`<data-table .resource=\${api.listUsers()} @open=\${event => navigate('user-detail',{id:event.detail.resource.id})}><table><tbody><template data-row><tr><td><data-label field="name"></data-label></td><td><button data-action="open">Open</button></td></tr></template></tbody></table></data-table>`;
  assert.doesNotThrow(()=>parseComponentSource(valid,{tag:'user-list',path:'components/user-list/component.html'}));

  const invalid=`<data-table .resource=\${api.listUsers()}><table><tbody><template data-row><tr><td>\${row.name}</td><td><button @click=\${() => navigate('user-detail')}>Open</button></td></tr></template></tbody></table></data-table>`;
  assert.throws(
    ()=>parseComponentSource(invalid,{tag:'user-list',path:'components/user-list/component.html'}),
    /Lit expressions are not allowed inside <template data-row>.*Move dynamic handlers\/bindings to the owning component/
  );
});

test('compiled modules are ordinary Lit custom elements using Metaproject runtime', () => {
  const module=compileComponentModule({tag:'user-detail',source:detailSource,css:'h1{font-weight:700}'});
  assert.match(module,/class UserDetailElement extends LitElement/);
  assert.match(module,/metaprojectEnvironment\(\)/);
  assert.match(module,/customElements\.define\("user-detail"/);
  assert.match(module,/static properties = \{"id": \{ type:Number \}\}/);
  assert.match(module,/unsafeCSS/);
});

test('design-time properties prefer examples and then defaults', () => {
  const definition=parseComponentSource(`<component-property name="id" type="integer" example="7"></component-property><component-property name="dense" type="boolean" default="true"></component-property>`,{tag:'user-card'});
  assert.deepEqual(designTimeProperties(definition),{id:7,dense:true});
});

test('all bundled HTML components compile to syntactically valid modules', async () => {
  const { readdir, readFile, writeFile, mkdtemp, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { spawnSync } = await import('node:child_process');
  const root='tests/fixtures/components';
  const temp=await mkdtemp(join(tmpdir(),'metaproject-compile-'));
  try {
    for (const entry of await readdir(root,{withFileTypes:true})) {
      if (!entry.isDirectory()) continue;
      const htmlPath=join(root,entry.name,'component.html');
      let source;
      try { source=await readFile(htmlPath,'utf8'); } catch { continue; }
      let css='';
      try { css=await readFile(join(root,entry.name,'style.css'),'utf8'); } catch {}
      const code=compileComponentModule({tag:entry.name,path:htmlPath,source,css});
      const target=join(temp,`${entry.name}.mjs`);
      await writeFile(target,code);
      const result=spawnSync(process.execPath,['--check',target],{encoding:'utf8'});
      assert.equal(result.status,0,`${entry.name} failed syntax check: ${result.stderr}`);
    }
  } finally { await rm(temp,{recursive:true,force:true}); }
});


test('compiled HTML components get safe default host sizing', async () => {
  const source = await readFile('compiler/index.js', 'utf8');
  assert.match(source, /BASE_COMPONENT_CSS/);
  assert.match(source, /display:block;box-sizing:border-box;max-width:100%;min-width:0/);
});

test('semantic component events are statically associated with API operations in their handlers', () => {
  const definition=parseComponentSource(editSource,{tag:'user-edit'});
  assert.deepEqual(definition.actionOperations,[{event:'save',operationId:'updateUser'}]);
});
