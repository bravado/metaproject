import test from 'node:test';
import assert from 'node:assert/strict';
import { parseComponentSource } from '../compiler/index.js';

test('component title may reference declared properties without rendering heading markup',()=>{
  const source=`<title>Rows — \${dbName}.\${tableName}</title>
<component-property name="dbName" type="string" example="app"></component-property>
<component-property name="tableName" type="string" example="users"></component-property>
<data-source request="listRows" db-name=\${dbName} table-name=\${tableName}></data-source>`;
  const definition=parseComponentSource(source,{tag:'db-table-rows'});
  assert.equal(definition.title,'Rows — ${dbName}.${tableName}');
  assert.doesNotMatch(definition.body,/<title\b|<header\b/);
});
