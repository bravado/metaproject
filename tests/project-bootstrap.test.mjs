import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_METAPROJECT_SOURCE,
  DEFAULT_OPENAPI_SOURCE,
  ensureProjectFiles
} from '../project/index.js';

class MemoryFilesystem {
  constructor(files = {}) { this.files = new Map(Object.entries(files)); }
  async exists(path) { return this.files.has(path); }
  async writeFile(path, content) { this.files.set(path, String(content)); }
  async readFile(path) { return this.files.get(path); }
}

test('empty project is bootstrapped with the Core-owned API/component root files', async () => {
  const fs = new MemoryFilesystem();
  assert.deepEqual(await ensureProjectFiles(fs), ['metaproject.yaml', 'openapi.yaml']);
  assert.equal(await fs.readFile('metaproject.yaml'), DEFAULT_METAPROJECT_SOURCE);
  assert.equal(await fs.readFile('openapi.yaml'), DEFAULT_OPENAPI_SOURCE);
  assert.match(DEFAULT_METAPROJECT_SOURCE, /^name: Metaproject$/m);
  assert.match(DEFAULT_METAPROJECT_SOURCE, /^version: 1$/m);
  assert.doesNotMatch(DEFAULT_METAPROJECT_SOURCE, /^api_root:/m);
  assert.match(DEFAULT_METAPROJECT_SOURCE, /^openapi: openapi\.yaml$/m);
  assert.match(DEFAULT_METAPROJECT_SOURCE, /^components:$/m);
  assert.match(DEFAULT_METAPROJECT_SOURCE, /^  source: components$/m);
  assert.match(DEFAULT_METAPROJECT_SOURCE, /^  output: public\/components$/m);
  assert.match(DEFAULT_OPENAPI_SOURCE, /^openapi: 3\.1\.0$/m);
  assert.match(DEFAULT_OPENAPI_SOURCE, /^servers:$/m);
  assert.match(DEFAULT_OPENAPI_SOURCE, /^  - url: \/api$/m);
  assert.match(DEFAULT_OPENAPI_SOURCE, /^paths: \{\}$/m);
  assert.match(DEFAULT_OPENAPI_SOURCE, /^  schemas: \{\}$/m);
});

test('bootstrap does not overwrite existing canonical files', async () => {
  const metaproject = 'name: Existing\nversion: 7\napi_root: /backend\n';
  const openapi = 'openapi: 3.1.0\ninfo:\n  title: Existing API\n  version: 1.2.3\npaths: {}\n';
  const fs = new MemoryFilesystem({ 'metaproject.yaml': metaproject, 'openapi.yaml': openapi });
  assert.deepEqual(await ensureProjectFiles(fs), []);
  assert.equal(await fs.readFile('metaproject.yaml'), metaproject);
  assert.equal(await fs.readFile('openapi.yaml'), openapi);
});

test('bootstrap creates only missing canonical files', async () => {
  const fs = new MemoryFilesystem({ 'metaproject.yaml': 'name: Existing\nversion: 1\n' });
  assert.deepEqual(await ensureProjectFiles(fs), ['openapi.yaml']);
  assert.equal(await fs.readFile('openapi.yaml'), DEFAULT_OPENAPI_SOURCE);
  assert.equal(await fs.readFile('metaproject.yaml'), 'name: Existing\nversion: 1\n');
});

test('bootstrap rejects incompatible filesystem adapters', async () => {
  await assert.rejects(() => ensureProjectFiles({}), /filesystem with exists\(\) and writeFile\(\)/);
});
