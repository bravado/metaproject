import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseComponentSource } from '../compiler/index.js';

const table=await readFile('components/data-table.js','utf8');

test('automatic data-table clones authored row-action HTML instead of action descriptors',()=>{
  assert.match(table,/authoredActionTemplates\(this\)/);
  assert.match(table,/hasActionIntent\(element\)/);
  assert.match(table,/data-action/);
  assert.match(table,/data-operation/);
  assert.match(table,/cloneActionTemplate\(source\)/);
  assert.match(table,/data-metaproject-actions/);
  assert.doesNotMatch(table,/set actions\(|get actions\(|normalizeActions\(|#actions/);
});

test('generated action controls inherit row resource context',()=>{
  assert.match(table,/ROW_CONTEXTS\.set\(tr,\{resource:row\.resource,schema:row\.schema\}\)/);
  assert.match(table,/#rowContext\(event\)/);
  assert.match(table,/emitDataAction\(element,this\.#rowContext\(event\)\.resource,event\)/);
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
