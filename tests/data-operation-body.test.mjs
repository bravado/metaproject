import test from 'node:test';
import assert from 'node:assert/strict';
import { operationBodyFromResource } from '../components/operation-body.js';

const updateRow = {
  operationId:'updateRow',
  method:'PATCH',
  parameters:[
    { name:'dbName', in:'path' },
    { name:'tableName', in:'path' },
    { name:'id', in:'path' }
  ],
  requestBody:{ required:true }
};

test('derived mutation body excludes fields declared as operation parameters',()=>{
  const resource={ id:2, name:'bob', score:31 };
  assert.deepEqual(operationBodyFromResource(updateRow,resource),{ name:'bob', score:31 });
  assert.deepEqual(resource,{ id:2, name:'bob', score:31 });
});

test('operations without request bodies do not derive a body',()=>{
  assert.equal(operationBodyFromResource({ operationId:'deleteRow', parameters:[{name:'id',in:'path'}] },{id:2}),undefined);
});
