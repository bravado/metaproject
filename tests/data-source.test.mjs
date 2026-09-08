import test from 'node:test';
import assert from 'node:assert/strict';
import { configureDataRuntime, invokeDataRequest, subscribeDataRuntime, createRestClient } from '../data-source/index.js';

const operations=[
  {operationId:'listRows',method:'GET',path:'/db/{db}/rows',parameters:[{name:'db',in:'path',required:true,schema:{type:'string'}},{name:'limit',in:'query',required:false,schema:{type:'integer'}}]},
  {operationId:'getRow',method:'GET',path:'/db/{db}/rows/{id}',parameters:[{name:'db',in:'path',required:true,schema:{type:'string'}},{name:'id',in:'path',required:true,schema:{type:'string'}}]},
  {operationId:'updateRow',method:'PATCH',path:'/db/{db}/rows/{id}',parameters:[{name:'db',in:'path',required:true,schema:{type:'string'}},{name:'id',in:'path',required:true,schema:{type:'string'}}],requestBody:{required:true,contentTypes:['application/json']}}
];

test('runtime caches GETs and deduplicates in-flight requests',async()=>{
  let calls=0,resolve;const client={invoke:(_operation,args)=>{calls++;assert.deepEqual(args.path,{db:'app'});assert.deepEqual(args.query,{limit:5});return new Promise(done=>{resolve=done;});}};
  configureDataRuntime({operations,client});
  const first=invokeDataRequest('listRows',{db:'app',limit:'5'});const second=invokeDataRequest('listRows',{db:'app',limit:'5'});
  assert.equal(first,second);assert.equal(calls,1);resolve([{id:1}]);assert.deepEqual(await first,[{id:1}]);assert.deepEqual(invokeDataRequest('listRows',{db:'app',limit:'5'}),[{id:1}]);assert.equal(calls,1);
});

test('successful mutations invalidate reads',()=>{
  let reads=0;const client={invoke:operation=>operation.method==='GET'?{version:++reads}:{ok:true}};configureDataRuntime({operations,client});
  assert.deepEqual(invokeDataRequest('getRow',{db:'app',id:'1'}),{version:1});assert.deepEqual(invokeDataRequest('getRow',{db:'app',id:'1'}),{version:1});assert.deepEqual(invokeDataRequest('updateRow',{db:'app',id:'1'},{body:{name:'edited'}}),{ok:true});assert.deepEqual(invokeDataRequest('getRow',{db:'app',id:'1'}),{version:2});
});

test('runtime subscriptions observe mutation invalidation',()=>{
  const events=[];configureDataRuntime({operations,client:{invoke:operation=>operation.method==='GET'?[]:{ok:true}}});const unsubscribe=subscribeDataRuntime(event=>events.push(event.type));invokeDataRequest('listRows',{db:'app'});invokeDataRequest('updateRow',{db:'app',id:'1'},{body:{}});unsubscribe();assert.ok(events.includes('invalidate'));assert.ok(events.includes('mutation'));
});

test('REST client exposes generic verbs',async()=>{
  const calls=[];const client=createRestClient({baseUrl:'https://example.test/api',fetch:async(url,init)=>{calls.push({url,init});return{ok:true,status:200,headers:{get:()=> 'application/json'},json:async()=>({ok:true})};}});await client.get('/rows',{query:{limit:2}});await client.patch('/rows/1',{body:{name:'x'}});assert.equal(calls[0].url,'https://example.test/api/rows?limit=2');assert.equal(calls[1].init.body,JSON.stringify({name:'x'}));
});
