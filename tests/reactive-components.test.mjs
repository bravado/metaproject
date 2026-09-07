import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const reactive=await readFile('components/reactive.js','utf8');

test('data-source supports keyed loader refresh and invalidation',()=>{
  assert.match(reactive,/DATA_INVALIDATE_EVENT = 'metaproject-data-invalidate'/);
  assert.match(reactive,/Object\.defineProperty\(DataSource\.prototype, 'key'/);
  assert.match(reactive,/typeof value === 'function'/);
  assert.match(reactive,/DataSource\.prototype\.refresh/);
  assert.match(reactive,/DataSource\.prototype\.invalidate/);
  assert.match(reactive,/invalidateDataSource/);
  assert.match(reactive,/if \(keys\.includes\(state\.key\)\) this\.refresh\(\)/);
  assert.match(reactive,/sourceResource\.set\.call\(this, undefined\)/);
});

test('data-table supports generic dynamic columns and semantic actions without native template expressions',()=>{
  assert.match(reactive,/Object\.defineProperty\(DataTable\.prototype, 'columns'/);
  assert.match(reactive,/Object\.defineProperty\(DataTable\.prototype, 'actions'/);
  assert.match(reactive,/inferColumns\(rows\)/);
  assert.match(reactive,/data-metaproject-auto-table/);
  assert.match(reactive,/emitDataAction\(button,row,event\)/);
  assert.match(reactive,/readDataField\(row,column\.field\)/);
});

test('async data-table resources explicitly schedule the auto renderer when the promise settles',()=>{
  assert.match(reactive,/resourceVersion = \+\+state\.resourceVersion/);
  assert.match(reactive,/Promise\.resolve\(value\)\.then/);
  assert.match(reactive,/resourceVersion === tableState\(this\)\.resourceVersion/);
  assert.match(reactive,/scheduleAutoTable\(this\)/);
});
