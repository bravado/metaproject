import test from 'node:test';
import assert from 'node:assert/strict';
import { configureDataRuntime, invokeDataRequest, subscribeDataRuntime, createRestClient } from '../data-source/index.js';

const operations=[
  {operationId:'listDatabases',method:'GET',path:'/',parameters:[]},
  {operationId:'listTables',method:'GET',path:'/{db}',parameters:[{name:'db',in:'path',required:true,schema:{type:'string'}}]},
  {operationId:'listRows',method:'GET',path:'/{db}/{table}',parameters:[{name:'db',in:'path',required:true,schema:{type:'string'}},{name:'table',in:'path',required:true,schema:{type:'string'}},{name:'limit',in:'query',required:false,schema:{type:'integer'}}]},
  {operationId:'getSchema',method:'GET',path:'/{db}/{table}/schema',parameters:[{name:'db',in:'path',required:true,schema:{type:'string'}},{name:'table',in:'path',required:true,schema:{type:'string'}}]},
  {operationId:'getRow',method:'GET',path:'/{db}/{table}/{id}',parameters:[{name:'db',in:'path',required:true,schema:{type:'string'}},{name:'table',in:'path',required:true,schema:{type:'string'}},{name:'id',in:'path',required:true,schema:{type:'string'}}]},
  {operationId:'updateRow',method:'PATCH',path:'/{db}/{table}/{id}',parameters:[{name:'db',in:'path',required:true,schema:{type:'string'}},{name:'table',in:'path',required:true,schema:{type:'string'}},{name:'id',in:'path',required:true,schema:{type:'string'}}],requestBody:{required:true,contentTypes:['application/json']}}
];

test('runtime caches GETs and deduplicates in-flight requests',async()=>{
  let calls=0,resolve;const client={invoke:(_operation,args)=>{calls++;assert.deepEqual(args.path,{db:'app',table:'rows'});assert.deepEqual(args.query,{limit:5});return new Promise(done=>{resolve=done;});}};
  configureDataRuntime({operations,client});
  const first=invokeDataRequest('listRows',{db:'app',table:'rows',limit:'5'});const second=invokeDataRequest('listRows',{db:'app',table:'rows',limit:'5'});
  assert.equal(first,second);assert.equal(calls,1);resolve([{id:1}]);assert.deepEqual(await first,[{id:1}]);assert.deepEqual(invokeDataRequest('listRows',{db:'app',table:'rows',limit:'5'}),[{id:1}]);assert.equal(calls,1);
});

test('successful mutations invalidate the resource and direct collection only',()=>{
  const calls=new Map();
  const client={invoke:operation=>{calls.set(operation.operationId,(calls.get(operation.operationId)||0)+1);return operation.method==='GET'?{operationId:operation.operationId,version:calls.get(operation.operationId)}:{ok:true};}};
  configureDataRuntime({operations,client});

  invokeDataRequest('listDatabases');
  invokeDataRequest('listTables',{db:'app'});
  invokeDataRequest('listRows',{db:'app',table:'mysql_compat'});
  invokeDataRequest('getSchema',{db:'app',table:'mysql_compat'});
  invokeDataRequest('getRow',{db:'app',table:'mysql_compat',id:'2'});

  invokeDataRequest('updateRow',{db:'app',table:'mysql_compat',id:'2'},{body:{name:'edited'}});

  invokeDataRequest('listDatabases');
  invokeDataRequest('listTables',{db:'app'});
  invokeDataRequest('listRows',{db:'app',table:'mysql_compat'});
  invokeDataRequest('getSchema',{db:'app',table:'mysql_compat'});
  invokeDataRequest('getRow',{db:'app',table:'mysql_compat',id:'2'});

  assert.deepEqual(Object.fromEntries(calls),{
    listDatabases:1,
    listTables:1,
    listRows:2,
    getSchema:1,
    getRow:2,
    updateRow:1
  });
});

test('runtime subscriptions expose scoped mutation invalidation',()=>{
  const events=[];configureDataRuntime({operations,client:{invoke:operation=>operation.method==='GET'?[]:{ok:true}}});const unsubscribe=subscribeDataRuntime(event=>events.push(event));invokeDataRequest('listRows',{db:'app',table:'rows'});invokeDataRequest('updateRow',{db:'app',table:'rows',id:'1'},{body:{}});unsubscribe();const invalidate=events.find(event=>event.type==='invalidate'&&event.reason==='updateRow');assert.equal(invalidate?.scoped,true);assert.equal(invalidate?.operation?.operationId,'updateRow');assert.deepEqual(invalidate?.args,{path:{db:'app',table:'rows',id:'1'}});
});

test('REST client exposes generic verbs and invoke supports all indexed HTTP methods',async()=>{
  const calls=[];const client=createRestClient({baseUrl:'https://example.test/api',fetch:async(url,init)=>{calls.push({url,init});return{ok:true,status:200,headers:{get:()=> 'application/json'},json:async()=>({ok:true})};}});await client.get('/rows',{query:{limit:2}});await client.patch('/rows/1',{body:{name:'x'}});await client.invoke({operationId:'inspectRows',method:'HEAD',path:'/rows',parameters:[]},{});await client.invoke({operationId:'optionsRows',method:'OPTIONS',path:'/rows',parameters:[]},{});assert.equal(calls[0].url,'https://example.test/api/rows?limit=2');assert.equal(calls[1].init.body,JSON.stringify({name:'x'}));assert.equal(calls[2].init.method,'HEAD');assert.equal(calls[3].init.method,'OPTIONS');
});
