import test from 'node:test';
import assert from 'node:assert/strict';

async function runtime(t) {
  try {
    const yaml = await import('yaml');
    const mutator = await import('../openapi/mutator.js');
    return { yaml, ...mutator };
  } catch (error) {
    if (error?.code === 'ERR_MODULE_NOT_FOUND' || /Cannot find package/.test(String(error?.message))) {
      t.skip('yaml dependency is not installed in this test environment');
      return null;
    }
    throw error;
  }
}

const operation = {
  id: '11111111-1111-4111-8111-111111111111',
  method: 'GET', path: '/new-resource', operationId: 'newResource', summary: '',
  responses: { '200': { description: 'Success', content: { 'application/json': { examples: { default: { value: {} } } } } } }
};

test('YAML adapter can add an operation to a zero-byte source', async t => {
  const rt = await runtime(t); if (!rt) return;
  const document = rt.yaml.parse(rt.upsertOperationYaml('', null, operation));
  assert.equal(document.openapi, '3.1.0');
  assert.equal(document.paths['/new-resource'].get.operationId, 'newResource');
});

test('YAML adapter can add an operation to explicit paths: {}', async t => {
  const rt = await runtime(t); if (!rt) return;
  const input = `openapi: 3.1.0\ninfo:\n  title: Empty\n  version: 0.0.0\npaths: {}\n`;
  const document = rt.yaml.parse(rt.upsertOperationYaml(input, null, operation));
  assert.equal(document.paths['/new-resource'].get.operationId, 'newResource');
});
