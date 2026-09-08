import test from 'node:test';
import assert from 'node:assert/strict';
import { createMockClient } from '../mock-api/client.js';
import { collectApiOperations } from '../operations/index.js';

function specification(){
  return {
    openapi:'3.1.0',
    paths:{
      '/db/{db}/rows':{
        get:{
          operationId:'listRows',
          parameters:[{name:'db',in:'path',required:true,schema:{type:'string'}}],
          responses:{'200':{content:{'application/json':{example:{data:[{id:1,name:'Ada'},{id:2,name:'Grace'}],total:2}}}}}
        },
        post:{
          operationId:'createRow',
          parameters:[{name:'db',in:'path',required:true,schema:{type:'string'}}],
          requestBody:{required:true,content:{'application/json':{schema:{type:'object'}}}},
          responses:{'201':{content:{'application/json':{example:{id:3}}}}}
        }
      },
      '/db/{db}/rows/{id}':{
        get:{
          operationId:'getRow',
          parameters:[{name:'db',in:'path',required:true,schema:{type:'string'}},{name:'id',in:'path',required:true,schema:{type:'string'}}],
          responses:{'200':{content:{'application/json':{examples:{
            one:{'x-metaproject-match':{path:{db:'app',id:'1'}},value:{id:1,name:'Ada'}},
            two:{'x-metaproject-match':{path:{db:'app',id:'2'}},value:{id:2,name:'Grace'}}
          }}}}}
        },
        patch:{
          operationId:'updateRow',
          parameters:[{name:'db',in:'path',required:true,schema:{type:'string'}},{name:'id',in:'path',required:true,schema:{type:'string'}}],
          requestBody:{required:true,content:{'application/json':{schema:{type:'object'}}}},
          responses:{'200':{content:{'application/json':{example:{id:1,name:'Example response'}}}}}
        },
        delete:{
          operationId:'deleteRow',
          parameters:[{name:'db',in:'path',required:true,schema:{type:'string'}},{name:'id',in:'path',required:true,schema:{type:'string'}}],
          responses:{'200':{content:{'application/json':{example:{deleted:1}}}}}
        }
      }
    }
  };
}

function operations(spec){return new Map(collectApiOperations(spec).map(operation=>[operation.operationId,operation]));}

test('mock client keeps PATCH state for item and collection refetches',()=>{
  const spec=specification();
  const op=operations(spec);
  const client=createMockClient(spec);
  assert.deepEqual(client.invoke(op.get('getRow'),{path:{db:'app',id:'2'}}),{id:2,name:'Grace'});
  client.invoke(op.get('updateRow'),{path:{db:'app',id:'2'},body:{id:2,name:'Grace Hopper'}});
  assert.deepEqual(client.invoke(op.get('getRow'),{path:{db:'app',id:'2'}}),{id:2,name:'Grace Hopper'});
  assert.deepEqual(client.invoke(op.get('listRows'),{path:{db:'app'}}),{data:[{id:1,name:'Ada'},{id:2,name:'Grace Hopper'}],total:2});
});

test('mock client scopes overlays by shared path parameters',()=>{
  const spec=specification();
  const op=operations(spec);
  const client=createMockClient(spec,{allowMissingRequired:false});
  client.invoke(op.get('updateRow'),{path:{db:'other',id:'1'},body:{id:1,name:'Other'}});
  assert.deepEqual(client.invoke(op.get('listRows'),{path:{db:'app'}}),{data:[{id:1,name:'Ada'},{id:2,name:'Grace'}],total:2});
});

test('mock client appends POST results and removes DELETE results from collection reads',()=>{
  const spec=specification();
  const op=operations(spec);
  const client=createMockClient(spec);
  client.invoke(op.get('createRow'),{path:{db:'app'},body:{name:'Katherine'}});
  assert.deepEqual(client.invoke(op.get('listRows'),{path:{db:'app'}}),{data:[{id:1,name:'Ada'},{id:2,name:'Grace'},{name:'Katherine',id:3}],total:3});
  client.invoke(op.get('deleteRow'),{path:{db:'app',id:'1'}});
  assert.deepEqual(client.invoke(op.get('listRows'),{path:{db:'app'}}),{data:[{id:2,name:'Grace'},{name:'Katherine',id:3}],total:2});
  assert.equal(client.invoke(op.get('getRow'),{path:{db:'app',id:'1'}}),undefined);
});

test('mock client reset discards mutation overlays',()=>{
  const spec=specification();
  const op=operations(spec);
  const client=createMockClient(spec);
  client.invoke(op.get('updateRow'),{path:{db:'app',id:'1'},body:{id:1,name:'Edited'}});
  client.reset();
  assert.deepEqual(client.invoke(op.get('getRow'),{path:{db:'app',id:'1'}}),{id:1,name:'Ada'});
});
