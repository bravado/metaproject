import test from 'node:test';
import assert from 'node:assert/strict';
import { createDataSource, createRestClient } from '../data-source/index.js';

const operations=[
  {operationId:'listRows',method:'GET',path:'/db/{db}/rows',parameters:[{name:'db',in:'path',required:true}],requestBody:null},
  {operationId:'getRow',method:'GET',path:'/db/{db}/rows/{id}',parameters:[{name:'db',in:'path',required:true},{name:'id',in:'path',required:true}],requestBody:null},
  {operationId:'updateRow',method:'PATCH',path:'/db/{db}/rows/{id}',parameters:[{name:'db',in:'path',required:true},{name:'id',in:'path',required:true}],requestBody:{required:true,contentTypes:['application/json']}}
];

test('DataSource caches successful GET operations and deduplicates in-flight requests',async()=>{
  let calls=0;
  let resolve;
  const client={invoke:()=>{calls+=1;return new Promise(done=>{resolve=done;});}};
  const source=createDataSource({client,operations});
  const args={path:{db:'app'}};
  const first=source.api.listRows(args);
  const second=source.api.listRows(args);
  assert.equal(first,second);
  assert.equal(calls,1);
  resolve([{id:1}]);
  assert.deepEqual(await first,[{id:1}]);
  assert.deepEqual(source.api.listRows(args),[{id:1}]);
  assert.equal(calls,1);
});

test('successful mutation invalidates cached reads and the next read refetches',async()=>{
  let reads=0;
  const client={invoke:operation=>operation.method==='GET'?{version:++reads}:{ok:true}};
  const source=createDataSource({client,operations});
  assert.deepEqual(source.api.getRow({path:{db:'app',id:'1'}}),{version:1});
  assert.deepEqual(source.api.getRow({path:{db:'app',id:'1'}}),{version:1});
  assert.deepEqual(source.api.updateRow({path:{db:'app',id:'1'},body:{name:'edited'}}),{ok:true});
  assert.deepEqual(source.api.getRow({path:{db:'app',id:'1'}}),{version:2});
});

test('DataSource subscriptions observe invalidation and refreshed query results',async()=>{
  const events=[];
  const source=createDataSource({client:{invoke:()=>Promise.resolve([{id:1}])},operations});
  const unsubscribe=source.subscribe(event=>events.push(event.type));
  await source.api.listRows({path:{db:'app'}});
  source.invalidate();
  unsubscribe();
  assert.ok(events.includes('query'));
  assert.ok(events.includes('invalidate'));
});

test('generic REST client exposes get/post/put/patch/delete against a base URL',async()=>{
  const calls=[];
  const client=createRestClient({baseUrl:'https://example.test/api',fetch:async(url,init)=>{calls.push({url,init});return{ok:true,status:200,headers:{get:()=> 'application/json'},json:async()=>({ok:true})};}});
  await client.get('/rows',{query:{limit:2}});
  await client.patch('/rows/1',{body:{name:'x'}});
  assert.equal(calls[0].url,'https://example.test/api/rows?limit=2');
  assert.equal(calls[0].init.method,'GET');
  assert.equal(calls[1].init.method,'PATCH');
  assert.equal(calls[1].init.body,JSON.stringify({name:'x'}));
});
