import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const reactive=await readFile('components/reactive.js','utf8');

test('data-source is a scoped DataSource provider instead of an element-local query cache',()=>{
  assert.match(reactive,/DATA_SOURCE_CONTEXT_REQUEST/);
  assert.match(reactive,/source:\{/);
  assert.match(reactive,/client:\{/);
  assert.match(reactive,/url:\{/);
  assert.match(reactive,/createDataSource/);
  assert.match(reactive,/node\.localName === 'data-source'/);
  assert.doesNotMatch(reactive,/Object\.defineProperty\(DataSourceElement\.prototype, 'key'/);
});

test('configureMetaproject establishes a default DataSource and derives api from it',()=>{
  assert.match(reactive,/setDefaultDataSource\(source\)/);
  assert.match(reactive,/api:source\.api/);
  assert.match(reactive,/configureBase\(next\)/);
});

test('data-resource provides resource context and can load through the resolved DataSource',()=>{
  assert.match(reactive,/class DataResource extends DataSourceElement/);
  assert.match(reactive,/requestDataSourceContext\(this/);
  assert.match(reactive,/source\?\.api\?\.\[this\._operation\]/);
  assert.match(reactive,/customElements\.define\('data-resource'/);
});

test('data-table supports generic dynamic columns and semantic actions without native template expressions',()=>{
  assert.match(reactive,/Object\.defineProperty\(DataTable\.prototype, 'columns'/);
  assert.match(reactive,/Object\.defineProperty\(DataTable\.prototype, 'actions'/);
  assert.match(reactive,/inferColumns\(rows\)/);
  assert.match(reactive,/data-metaproject-auto-table/);
  assert.match(reactive,/emitDataAction\(button,row,event\)/);
  assert.match(reactive,/readDataField\(row,column\.field\)/);
});

test('auto-table actions are delegated independently of custom-element lifecycle patch timing',()=>{
  assert.match(reactive,/document\.addEventListener\('click'/);
  assert.match(reactive,/path\.find\(node=>node instanceof DataTable\)/);
  assert.match(reactive,/AUTO_ACTION_EVENTS\.has\(event\)/);
  assert.match(reactive,/AUTO_ACTION_EVENTS\.add\(event\)/);
  assert.match(reactive,/handleAutoAction\(host,event\)/);
});

test('async data-table resources explicitly schedule the auto renderer when the promise settles',()=>{
  assert.match(reactive,/resourceVersion=\+\+state\.resourceVersion/);
  assert.match(reactive,/Promise\.resolve\(value\)\.then/);
  assert.match(reactive,/resourceVersion===tableState\(this\)\.resourceVersion/);
  assert.match(reactive,/scheduleAutoTable\(this\)/);
});
