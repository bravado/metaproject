import test from 'node:test';
import assert from 'node:assert/strict';
import { configureDataRuntime, getDataRuntime, getDataOperation, invokeDataRequest, subscribeDataRuntime } from '../data-source/index.js';

test('two API scopes may use identical operationIds with independent clients and caches',()=>{
  const operations=[{operationId:'listItems',method:'GET',path:'/items',parameters:[]}];
  let usersCalls=0,billingCalls=0;
  configureDataRuntime({scope:'users',operations,client:{invoke:()=>{usersCalls++;return [{kind:'user'}];}}});
  configureDataRuntime({scope:'billing',operations,client:{invoke:()=>{billingCalls++;return [{kind:'invoice'}];}}});
  assert.deepEqual(invokeDataRequest('listItems',{}, {scope:'users'}),[{kind:'user'}]);
  assert.deepEqual(invokeDataRequest('listItems',{}, {scope:'billing'}),[{kind:'invoice'}]);
  assert.deepEqual(invokeDataRequest('listItems',{}, {scope:'users'}),[{kind:'user'}]);
  assert.equal(usersCalls,1);
  assert.equal(billingCalls,1);
  assert.equal(getDataRuntime('users').operations.listItems.path,'/items');
  assert.equal(getDataOperation('listItems','billing').method,'GET');
});

test('mutation cache invalidation and subscriptions stay inside their API scope',()=>{
  const operations=[
    {operationId:'listItems',method:'GET',path:'/items',parameters:[]},
    {operationId:'updateItem',method:'PATCH',path:'/items/{id}',parameters:[{name:'id',in:'path',required:true,schema:{type:'integer'}}]}
  ];
  const counts={users:0,billing:0};
  for(const scope of ['users','billing']){
    configureDataRuntime({scope,operations,client:{invoke:operation=>{
      if(operation.method==='GET') counts[scope]++;
      return operation.method==='GET' ? {scope,count:counts[scope]} : {ok:true};
    }}});
  }
  const events={users:[],billing:[]};
  const unsub=Object.fromEntries(Object.keys(events).map(scope=>[scope,subscribeDataRuntime(event=>events[scope].push(event),{scope})]));
  try{
    invokeDataRequest('listItems',{}, {scope:'users'});
    invokeDataRequest('listItems',{}, {scope:'billing'});
    invokeDataRequest('updateItem',{id:1},{scope:'users'});
    assert.deepEqual(invokeDataRequest('listItems',{}, {scope:'users'}),{scope:'users',count:2});
    assert.deepEqual(invokeDataRequest('listItems',{}, {scope:'billing'}),{scope:'billing',count:1});
    assert.ok(events.users.some(event=>event.reason==='updateItem'));
    assert.equal(events.billing.some(event=>event.reason==='updateItem'),false);
  }finally{for(const stop of Object.values(unsub))stop();}
});
