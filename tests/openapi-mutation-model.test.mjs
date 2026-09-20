import test from 'node:test';
import assert from 'node:assert/strict';
import { mutateOperationDocument, mutateSchemaDocument } from '../openapi/mutation-model.js';

const operation = {
  id: '11111111-1111-4111-8111-111111111111',
  method: 'GET',
  path: '/new-resource',
  operationId: 'newResource',
  summary: '',
  responses: {
    '200': {
      description: 'Success',
      content: { 'application/json': { examples: { default: { value: { id: 1 } } } } }
    }
  }
};

test('first operation creates paths, path item and HTTP method maps', () => {
  const document = { openapi: '3.1.0', info: { title: 'Empty', version: '0.0.0' } };
  mutateOperationDocument(document, null, operation);
  assert.equal(document.paths['/new-resource'].get.operationId, 'newResource');
  assert.equal(document.paths['/new-resource'].get['x-project-id'], operation.id);
});

test('first operation works when paths is already empty', () => {
  const document = { openapi: '3.1.0', info: { title: 'Empty', version: '0.0.0' }, paths: {} };
  mutateOperationDocument(document, null, operation);
  assert.equal(document.paths['/new-resource'].get.operationId, 'newResource');
});

test('adding GET preserves POST on the same path', () => {
  const document = {
    openapi: '3.1.0', info: { title: 'Existing', version: '0.0.0' },
    paths: { '/new-resource': { post: { operationId: 'createResource' } } }
  };
  mutateOperationDocument(document, null, operation);
  assert.equal(document.paths['/new-resource'].post.operationId, 'createResource');
  assert.equal(document.paths['/new-resource'].get.operationId, 'newResource');
});

test('moving an existing operation removes the old empty path item', () => {
  const existing = { ...operation, path: '/old', method: 'GET' };
  const document = {
    openapi: '3.1.0', info: { title: 'Existing', version: '0.0.0' },
    paths: { '/old': { get: { operationId: 'newResource', 'x-project-id': operation.id } } }
  };
  mutateOperationDocument(document, existing, operation);
  assert.equal(document.paths['/old'], undefined);
  assert.equal(document.paths['/new-resource'].get.operationId, 'newResource');
});

test('scalar path items fail with a clear mapping error', () => {
  const document = { openapi: '3.1.0', info: {}, paths: { '/new-resource': 'broken' } };
  assert.throws(() => mutateOperationDocument(document, null, operation), /paths\.\/new-resource must be a YAML mapping/);
});

test('schema mutation creates components.schemas', () => {
  const document = { openapi: '3.1.0', info: { title: 'Empty', version: '0.0.0' }, paths: {} };
  mutateSchemaDocument(document, null, {
    id: '22222222-2222-4222-8222-222222222222',
    name: 'Voucher', properties: { id: { type: 'integer' } }, required: ['id']
  });
  assert.equal(document.components.schemas.Voucher.type, 'object');
  assert.equal(document.components.schemas.Voucher['x-project-id'], '22222222-2222-4222-8222-222222222222');
});
