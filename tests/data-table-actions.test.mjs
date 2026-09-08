import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseComponentSource } from '../compiler/index.js';

const table=await readFile('components/data-table.js','utf8');
const context=await readFile('components/context.js','utf8');

test('automatic data-table clones authored row-action HTML instead of action descriptors',()=>{
  assert.match(table,/authoredActionTemplates\(this\)/);
  assert.match(table,/hasActionIntent\(element\)/);
  assert.match(table,/data-action/);
  assert.match(table,/data-operation/);
  assert.match(table,/cloneActionTemplate\(source\)/);
  assert.match(table,/data-metaproject-actions/);
  assert.match(table,/set actions\(_value\) \{ throw new Error\('[^']*\.actions was removed/);
  assert.doesNotMatch(table,/get actions\(|normalizeActions\(|#actions/);
});

test('direct action children on a component override its first automatic table actions',()=>{
  assert.match(table,/componentActionOverrides\(this\)/);
  assert.match(table,/root\?\.querySelector\?\.\('data-table'\)!==table/);
  assert.match(table,/\[\.\.\.host\.children\]\.filter\(element=>hasActionIntent\(element\)\)/);
  assert.match(table,/#hostObserver/);
  assert.match(table,/this\.#hostObserver\.observe\(host,\{childList:true\}\)/);
});

test('generated action controls inherit row resource context',()=>{
  assert.match(table,/ROW_CONTEXTS\.set\(tr,\{resource:row\.resource,schema:row\.schema\}\)/);
  assert.match(table,/#rowContext\(event\)/);
  assert.match(table,/emitDataAction\(element,this\.#rowContext\(event\)\.resource,event\)/);
});

test('data-action emits both its semantic CustomEvent and neutral metaproject action relay',()=>{
  assert.match(context,/METAPROJECT_ACTION_EVENT = 'metaproject-action'/);
  assert.match(context,/new CustomEvent\(action,\{bubbles:true,composed:true/);
  assert.match(context,/new CustomEvent\(METAPROJECT_ACTION_EVENT,\{bubbles:true,composed:true/);
});

test('component analysis recognizes authored local and API row actions',()=>{
  const definition=parseComponentSource(`
    <title>Users</title>
    <data-source request="listUsers">
      <data-table @open=\${event => navigate('user-edit', { id:event.detail.resource.id })}>
        <button data-action="open">Open</button>
        <button data-operation=deleteUser>Delete</button>
      </data-table>
    </data-source>
  `,{tag:'user-list'});
  assert.deepEqual(definition.actions,['open']);
  assert.ok(definition.relationships.some(rel=>rel.type==='calls'&&rel.target==='listUsers'));
  assert.ok(definition.relationships.some(rel=>rel.type==='calls'&&rel.target==='deleteUser'));
  assert.ok(definition.relationships.some(rel=>rel.type==='navigates-to'&&rel.target==='user-edit'));
});
