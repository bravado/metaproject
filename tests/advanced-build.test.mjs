import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { discoverProjectComponents } from '../build/index.js';

test('build discovers advanced single-file components beside HTML-first components', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'metaproject-advanced-discovery-'));
  try {
    fs.mkdirSync(path.join(root, 'components', 'html-card'), { recursive:true });
    fs.writeFileSync(path.join(root, 'components', 'html-card', 'component.html'), '<title>HTML Card</title><div>Card</div>');
    fs.writeFileSync(path.join(root, 'components', 'live-grid.js'), "customElements.define('live-grid', class extends HTMLElement {});\n");
    const components = discoverProjectComponents(root);
    assert.deepEqual([...components.keys()].sort(), ['html-card', 'live-grid']);
    assert.equal(components.get('html-card').advanced, false);
    assert.equal(components.get('live-grid').advanced, true);
    assert.equal(components.get('live-grid').relativeSourcePath, 'components/live-grid.js');
  } finally {
    fs.rmSync(root, { recursive:true, force:true });
  }
});

test('advanced production entries receive the same api and navigate runtime contract as Canvas', async () => {
  const source = await readFile('build/index.js', 'utf8');
  assert.match(source, /advancedComponentEntrySource/);
  assert.match(source, /metaprojectEnvironment/);
  assert.match(source, /const api = new Proxy/);
  assert.match(source, /const navigate = \(\.\.\.args\)/);
  assert.match(source, /component\.advanced/);
});
