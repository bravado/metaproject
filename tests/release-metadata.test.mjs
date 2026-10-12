import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));

test('public package has consistent metadata and license',()=>{
  assert.equal(pkg.name,'metaproject');
  assert.equal(pkg.license,'MIT');
  assert.match(pkg.description,/OpenAPI/);
  assert.deepEqual(pkg.repository,{type:'git',url:'git+https://github.com/metaproject/core.git'});
  assert.equal(pkg.homepage,'https://github.com/metaproject/core#readme');
  assert.equal(pkg.bugs.url,'https://github.com/metaproject/core/issues');
  assert.ok(pkg.keywords.includes('openapi'));
  assert.ok(pkg.keywords.includes('web-components'));
  assert.match(fs.readFileSync('LICENSE','utf8'),/^MIT License/);
  assert.match(fs.readFileSync('LICENSE','utf8'),/Copyright \(c\) 2026 Metaproject contributors/);
});

test('release documents are reachable and describe the current public contract',()=>{
  const readme=fs.readFileSync('README.md','utf8');
  for(const file of ['LICENSE','CHANGELOG.md','CONTRIBUTING.md','SECURITY.md']){
    assert.ok(fs.existsSync(file),file);
    assert.ok(pkg.files.includes(file),file+' must be distributed');
    assert.ok(readme.includes(']('+file+')'),file+' must be linked from README');
  }
  const changelog=fs.readFileSync('CHANGELOG.md','utf8');
  assert.match(changelog,/## \[0\.11\.0\] — Planned first public release/);
  assert.match(changelog,/runtime ABI v1/);
  assert.match(changelog,/OpenAPI 3\.0\/3\.1/);
  assert.doesNotMatch(changelog,/\b(?:migration|legacy|deprecated)\b/i);
  const contribution=fs.readFileSync('CONTRIBUTING.md','utf8');
  assert.match(contribution,/npm ci/);
  assert.match(contribution,/npm test/);
  assert.match(contribution,/npm run test:browser/);
  const security=fs.readFileSync('SECURITY.md','utf8');
  assert.match(security,/0\.11\.x/);
  assert.match(security,/https:\/\/github\.com\/metaproject\/core\/security\/advisories\/new/);
  assert.match(security,/issue #22/);
});

test('npm pack dry run includes all release metadata and documents',()=>{
  const npm=process.platform==='win32'?'npm.cmd':'npm';
  const result=spawnSync(npm,['pack','--ignore-scripts','--dry-run','--json'],{encoding:'utf8'});
  assert.equal(result.status,0,result.stderr||result.stdout);
  const info=JSON.parse(result.stdout)[0];
  assert.equal(info.name,'metaproject');
  assert.equal(info.version,pkg.version);
  const included=new Set(info.files.map(x=>x.path));
  for(const file of ['package.json','README.md','LICENSE','CHANGELOG.md','CONTRIBUTING.md','SECURITY.md']){
    assert.ok(included.has(file),file+' missing from npm tarball');
  }
});
