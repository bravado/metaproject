import test from 'node:test';
import assert from 'node:assert/strict';
import { validateOpenApiExamples, assertOpenApiExamples } from '../openapi/index.js';

function operation(responses) {
  return {
    openapi:'3.1.0',
    paths:{'/users':{get:{operationId:'listUsers',responses}}}
  };
}

test('example validation accepts explicit response examples and no-content responses', () => {
  assert.deepEqual(validateOpenApiExamples(operation({
    '200':{description:'Users',content:{'application/json':{examples:{default:{value:[{id:1}]}}}}},
    '204':{description:'No content'}
  })),[]);
});

test('example validation reports a content response without an explicit example', () => {
  const diagnostics=validateOpenApiExamples(operation({
    '200':{description:'Users',content:{'application/json':{schema:{type:'array'}}}}
  }));
  assert.equal(diagnostics.length,1);
  assert.equal(diagnostics[0].code,'missing-success-example');
  assert.match(diagnostics[0].message,/listUsers/);
  assert.match(diagnostics[0].message,/GET \/users/);
});

test('example validation reports operations without successful responses', () => {
  const diagnostics=validateOpenApiExamples(operation({'400':{description:'Bad request'}}));
  assert.equal(diagnostics[0].code,'missing-success-response');
});

test('example validation resolves local Example Object refs', () => {
  const spec=operation({'200':{description:'Users',content:{'application/json':{examples:{default:{$ref:'#/components/examples/Users'}}}}}});
  spec.components={examples:{Users:{value:[{id:1}]}}};
  assert.deepEqual(validateOpenApiExamples(spec),[]);
});

test('assertOpenApiExamples throws an actionable multi-operation error', () => {
  assert.throws(()=>assertOpenApiExamples(operation({'200':{description:'Users',content:{'application/json':{}}}})),/OpenAPI examples are incomplete/);
});

test('example validation rejects empty structured defaults that cannot showcase behavior', () => {
  const diagnostics=validateOpenApiExamples(operation({
    '200':{description:'Users',content:{'application/json':{examples:{default:{value:[]},empty:{value:[]},populated:{value:[{id:1}]}}}}}
  }));
  assert.equal(diagnostics[0].code,'empty-success-example');
  assert.match(diagnostics[0].message,/minimal representative data/);
});

test('a populated default may coexist with an empty alternate example', () => {
  assert.deepEqual(validateOpenApiExamples(operation({
    '200':{description:'Users',content:{'application/json':{examples:{default:{value:[{id:1}]},empty:{value:[]}}}}}
  })),[]);
});
