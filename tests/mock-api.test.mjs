import test from 'node:test';
import assert from 'node:assert/strict';
import { createMockApi, collectMockOperations, resolveMockResponse, MockApiError } from '../mock-api/index.js';

function specification() {
  return {
    openapi:'3.1.0',
    paths:{
      '/users':{
        get:{
          operationId:'listUsers','x-project-id':'op-list',
          responses:{
            '200':{content:{'application/json':{examples:{default:{value:[{id:1,name:'John'}]}}}}}
          }
        },
        post:{
          operationId:'createUser','x-project-id':'op-create',
          requestBody:{required:true,content:{'application/json':{schema:{type:'object'}}}},
          responses:{
            '201':{content:{'application/json':{example:{id:2,name:'Mary'}}}}
          }
        }
      },
      '/users/{id}':{
        parameters:[{name:'id',in:'path',required:true,schema:{type:'integer'}}],
        get:{
          operationId:'getUser','x-project-id':'op-get',
          responses:{
            '200':{content:{
              'text/plain':{example:'plain user'},
              'application/json':{examples:{
                first:{'x-metaproject-match':{path:{id:1}},value:{id:1,name:'John'}},
                second:{'x-metaproject-match':{path:{id:2}},value:{id:2,name:'Mary'}}
              }}
            }}
          }
        },
        put:{
          operationId:'updateUser','x-project-id':'op-update',
          requestBody:{required:true,content:{'application/json':{schema:{type:'object'}}}},
          responses:{
            '200':{content:{'application/json':{examples:{default:{value:{id:1,name:'Updated'}}}}}}
          }
        },
        delete:{
          operationId:'deleteUser','x-project-id':'op-delete',
          responses:{'204':{description:'Deleted'}}
        }
      },
      '/reports':{
        get:{operationId:'getReport','x-project-id':'op-report',responses:{'200':{content:{'application/json':{schema:{type:'object'}}}}}}
      }
    }
  };
}

test('mock API exposes one method per OpenAPI operationId',()=>{
  const operations=collectMockOperations(specification());
  assert.deepEqual(operations.map(x=>x.operationId),['listUsers','createUser','getUser','updateUser','deleteUser','getReport']);
  assert.equal(operations.find(x=>x.operationId==='updateUser').projectId,'op-update');
  assert.equal(operations.find(x=>x.operationId==='updateUser').method,'PUT');
  assert.equal(operations.find(x=>x.operationId==='updateUser').path,'/users/{id}');
});

test('mock API returns OpenAPI response examples without HTTP',()=>{
  const api=createMockApi(specification());
  assert.deepEqual(api.listUsers(),[{id:1,name:'John'}]);
  assert.deepEqual(api.createUser({body:{name:'Input'}}),{id:2,name:'Mary'});
  assert.deepEqual(api.updateUser({path:{id:1},body:{id:1,name:'Input'}}),{id:1,name:'Updated'});
});

test('mock response selects x-metaproject-match examples from invocation arguments',()=>{
  const api=createMockApi(specification());
  assert.deepEqual(api.getUser({path:{id:1}}),{id:1,name:'John'});
  assert.deepEqual(api.getUser({path:{id:2}}),{id:2,name:'Mary'});
});

test('mock response prefers application/json and first named example when no matcher applies',()=>{
  const api=createMockApi(specification());
  assert.deepEqual(api.getUser({path:{id:123}}),{id:1,name:'John'});
});

test('call response selection can choose status/media/example explicitly',()=>{
  const api=createMockApi(specification());
  assert.deepEqual(api.getUser({path:{id:123},response:{status:'200',mediaType:'application/json',example:'second'}}),{id:2,name:'Mary'});
});

test('configured response scenarios can be overridden per call',()=>{
  const api=createMockApi(specification(),{responses:{getUser:{example:'second'}}});
  assert.deepEqual(api.getUser({path:{id:1}}),{id:2,name:'Mary'});
  assert.deepEqual(api.getUser({path:{id:1},response:{example:'first'}}),{id:1,name:'John'});
});

test('mock values are cloned so component mutations do not alter OpenAPI examples',()=>{
  const api=createMockApi(specification());
  const first=api.getUser({path:{id:1}});
  first.name='Mutated';
  assert.equal(api.getUser({path:{id:1}}).name,'John');
});

test('required path and request body validation mirrors the production call contract',()=>{
  const api=createMockApi(specification());
  assert.throws(()=>api.getUser(),/missing required path parameter id/);
  assert.throws(()=>api.updateUser({path:{id:1}}),/request body is required/);
  assert.doesNotThrow(()=>api.updateUser({path:{id:1},body:{}}));
});

test('Mock API can relax required inputs during initial previews',()=>{
  let phase='render';
  const api=createMockApi(specification(),{allowMissingRequired:()=>phase==='render'});
  assert.deepEqual(api.getUser(),{id:1,name:'John'});
  phase='interactive';
  assert.throws(()=>api.getUser(),/missing required path parameter id/);
});

test('operation invocation hook fires before validation and identifies the canonical operation',()=>{
  const seen=[];
  const api=createMockApi(specification(),{onInvoke:operation=>seen.push(operation)});
  assert.throws(()=>api.updateUser({path:{id:1}}),/request body is required/);
  assert.equal(seen.length,1);
  assert.equal(seen[0].operationId,'updateUser');
  assert.equal(seen[0].projectId,'op-update');
  assert.equal(seen[0].method,'PUT');
});

test('responses without content return undefined and missing examples fail explicitly',()=>{
  const api=createMockApi(specification());
  assert.equal(api.deleteUser({path:{id:1}}),undefined);
  assert.throws(()=>api.getReport(),error=>error instanceof MockApiError && /no OpenAPI example/.test(error.message));
});

test('optional mock delay returns a Promise while preserving the example value',async()=>{
  const api=createMockApi(specification(),{delay:1});
  const result=api.listUsers();
  assert.equal(typeof result.then,'function');
  assert.deepEqual(await result,[{id:1,name:'John'}]);
});

test('local response and example refs are resolved',()=>{
  const openapi={
    openapi:'3.1.0',
    paths:{'/thing':{get:{operationId:'getThing',responses:{'200':{$ref:'#/components/responses/Thing'}}}}},
    components:{
      responses:{Thing:{content:{'application/json':{examples:{default:{$ref:'#/components/examples/ThingExample'}}}}}},
      examples:{ThingExample:{value:{id:9}}}
    }
  };
  const api=createMockApi(openapi);
  assert.deepEqual(api.getThing(),{id:9});
});
