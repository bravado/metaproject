import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const index=await readFile('components/index.js','utf8');
const source=await readFile('components/data-source.js','utf8');
const table=await readFile('components/data-table.js','utf8');
const form=await readFile('components/data-form.js','utf8');
const context=await readFile('components/context.js','utf8');

test('canonical runtime registers only the lean data primitives',()=>{
  assert.match(index,/\['data-source',DataSourceElement\]/);
  assert.match(index,/\['data-table',DataTable\]/);
  assert.match(index,/\['data-form',DataForm\]/);
  assert.doesNotMatch(index,/data-resource|reactive\.js|DataSourceStore/);
});

test('data-source owns request/select, flat parameters, and generic data-operation execution',()=>{
  assert.match(source,/\['request','select'\]/);
  assert.match(source,/invokeDataRequest\(operationId/);
  assert.match(source,/camelToKebab\(parameter\.name\)/);
  assert.match(source,/data-operation/);
  assert.match(source,/operation\.requestBody \? resource : undefined/);
  assert.match(source,/selectDataSchema/);
  assert.doesNotMatch(source,/save/);
});

test('data-table inherits resource context and auto-renders arrays and objects',()=>{
  assert.match(table,/requestResourceContext\(this/);
  assert.match(table,/tableModel\(this\.#resource/);
  assert.match(table,/Array\.isArray\(resource\)/);
  assert.match(table,/Object\.entries\(resource\)/);
  assert.match(table,/template\[data-row\]/);
});

test('data-form inherits object context, generates typed controls, and exposes edited context',()=>{
  assert.match(form,/class DataForm extends LitElement/);
  assert.match(form,/requestResourceContext\(this/);
  assert.match(form,/new ResourceContextController\(this,\(\)=>this\._value/);
  assert.match(form,/schema\?\.format==='email'/);
  assert.match(form,/type==='boolean'/);
  assert.match(form,/Array\.isArray\(schema\?\.enum\)/);
  assert.match(form,/<slot><\/slot>/);
  assert.doesNotMatch(form,/new CustomEvent\('save'/);
});

test('explicit field controls still mutate resource context',()=>{
  assert.match(context,/export function writeDataField/);
  assert.match(form,/writeDataField\(resource,this\.field,value\)/);
  assert.match(context,/RESOURCE_CHANGE_EVENT/);
});
