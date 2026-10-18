import test from 'node:test';
import assert from 'node:assert/strict';
import { buildProjectIndex, relatedRelationships } from '../project/index.js';

const openapi={
  openapi:'3.1.0',
  info:{title:'T',version:'1'},
  paths:{
    '/users':{get:{operationId:'listUsers','x-project-id':'op-list',responses:{'200':{description:'ok',content:{'application/json':{schema:{type:'array',items:{$ref:'#/components/schemas/User'}},example:[{id:1}]}}}}}},
    '/users/{id}':{get:{operationId:'getUser','x-project-id':'op-get',parameters:[{name:'id',in:'path',required:true,schema:{type:'integer'}}],responses:{'200':{description:'ok',content:{'application/json':{schema:{$ref:'#/components/schemas/User'},example:{id:1}}}}}}}
  },
  components:{schemas:{User:{'x-project-id':'schema-user',type:'object',properties:{id:{type:'integer'}}}}}
};

const files={
  'frontend/metaproject/user-list/component.html':'<title>Users</title><data-source request="listUsers"><data-table><button data-action="open">Open</button></data-table></data-source>',
  'frontend/metaproject/user-detail/component.html':'<title>User</title><component-property name="id" type="integer" example="1"></component-property><data-source request="getUser" id=${id}></data-source>'
};

const project={components:{source:'frontend/metaproject',output:'public/components'}};

test('Core indexes configured component source, OpenAPI resources, and relationships',()=>{
  const index=buildProjectIndex({files,openapi,project});
  assert.deepEqual(index.components.map(value=>value.tag).sort(),['user-detail','user-list']);
  assert.deepEqual(index.operations.map(value=>value.operationId).sort(),['getUser','listUsers']);
  assert.deepEqual(index.schemas.map(value=>value.name),['User']);
  assert.ok(index.relationships.some(value=>value.source==='user-list'&&value.target==='op-list'&&value.type==='calls'));
  assert.ok(index.relationships.some(value=>value.source==='user-detail'&&value.target==='op-get'&&value.type==='calls'));
  assert.ok(index.relationships.some(value=>value.source==='op-list'&&value.target==='schema-user'&&value.type==='uses'));
  assert.equal(index.diagnostics.filter(value=>value.severity==='error').length,0);
});

test('Core index only exposes API and component resources regardless of unrelated project metadata',()=>{
  const index=buildProjectIndex({files,openapi,project:{...project,editor:{tabs:['overview']}}});
  assert.equal(Object.hasOwn(index,'views'),false);
  assert.deepEqual(index.resources.map(resource=>resource.kind).sort(),['component','component','operation','operation','schema']);
});

test('unknown component operations are diagnosed by the shared Core index',()=>{
  const index=buildProjectIndex({
    files:{'ui/problem-view/component.html':'<title>Problem</title><data-source request="doesNotExist"></data-source>'},
    openapi,
    project:{components:{source:'ui'}}
  });
  const diagnostic=index.diagnostics.find(value=>value.code==='unknown-operation');
  assert.ok(diagnostic);
  assert.equal(diagnostic.resource,'problem-view');
  assert.equal(diagnostic.sourcePath,'ui/problem-view/component.html');
});

test('relatedRelationships only returns relationships whose endpoints are present',()=>{
  const index=buildProjectIndex({files,openapi,project});
  const rels=relatedRelationships(index,['user-list','op-list']);
  assert.equal(rels.length,1);
  assert.equal(rels[0].type,'calls');
});
