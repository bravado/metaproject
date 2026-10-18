import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

const files = process.argv.slice(2);
assert.equal(files.length, 1, 'Expected exactly one packed tarball');
const archive = path.resolve(files[0]);
assert.match(archive, /\.tgz$/);
const listed = spawnSync('tar', ['-tzf', archive], {encoding:'utf8'});
assert.equal(listed.status, 0, listed.stderr);
const entries = listed.stdout.split('\n').filter(Boolean);
assert.ok(entries.length > 0);
assert.ok(entries.every(name => name.startsWith('package/')), 'Unexpected archive prefix');
for (const entry of entries) {
  const parts = entry.split('/');
  assert.ok(!parts.includes('..'), 'Unsafe archive path: '+entry);
  for (const forbidden of ['node_modules','.git','dist','tests']) {
    assert.ok(!parts.includes(forbidden), 'Unexpected development asset: '+entry);
  }
}
for (const mandatory of ['package.json','README.md','LICENSE','CHANGELOG.md',
  'CONTRIBUTING.md','SECURITY.md','bin/metaproject.js','build/index.js']) {
  assert.ok(entries.includes('package/'+mandatory), 'Missing '+mandatory);
}
const extracted = spawnSync('tar',['-xOzf',archive,'package/package.json'],
  {encoding:'utf8'});
assert.equal(extracted.status, 0, extracted.stderr);
const packed = JSON.parse(extracted.stdout);
const pkg = JSON.parse(fs.readFileSync('package.json','utf8'));
const lock = JSON.parse(fs.readFileSync('package-lock.json','utf8'));
assert.equal(packed.name,'metaproject');
assert.equal(packed.version,pkg.version);
assert.equal(packed.version,lock.version);
assert.equal(packed.version,lock.packages?.['']?.version);
assert.equal(packed.license,'MIT');
assert.equal(packed.repository?.url,'git+https://github.com/bravado/metaproject.git');
console.log('Verified GitHub Release archive '+path.basename(archive));
