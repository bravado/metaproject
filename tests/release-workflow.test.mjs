import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
import YAML from 'yaml';

const text = fs.readFileSync('.github/workflows/release.yml','utf8');
const workflow = YAML.parse(text);

test('release workflow is rehearsal-only except for approved tags',()=>{
  assert.deepEqual(workflow.on.push.tags,['v*']);
  assert.ok(Object.hasOwn(workflow.on,'workflow_dispatch'));
  assert.equal(workflow.permissions.contents,'read');
  assert.match(workflow.jobs.guard.steps.at(-1).run,/refs\/heads\/master/);
  assert.match(workflow.jobs.guard.steps.at(-1).run,/bravado\/metaproject/);
  assert.match(workflow.jobs.guard.steps.at(-1).run,/--rehearsal/);
  assert.match(workflow.jobs.guard.steps.at(-1).run,/--tag/);
  assert.equal(workflow.jobs['github-release'].if,
    String.fromCharCode(36)+"{{ github.event_name == 'push' }}");
  assert.equal(workflow.jobs['github-release'].permissions.contents,'write');
  assert.ok(workflow.jobs['github-release'].needs.includes('browser'));
  assert.doesNotMatch(text,/npm publish|NPM_TOKEN|NODE_AUTH_TOKEN|id-token:\s*write/);
});
test('the single checked tarball is used in consumer, browser and GitHub Release',()=>{
  assert.equal((text.match(/npm pack --pack-destination/g)||[]).length,1);
  assert.match(text,/node tests\/packed-consumer\.mjs dist\/\*\.tgz/);
  assert.match(text,/node tests\/packed-browser-smoke\.mjs dist\/\*\.tgz/);
  assert.match(text,/gh release create .*dist\/\*\.tgz/);
  assert.match(text,/gh release create [\s\S]*--draft --verify-tag/);
  assert.match(text,/sha256sum --check SHA256SUMS/);
  assert.match(text,/gh release download/);
  assert.match(text,/gh release edit "\$TAG" --draft=false/);
});
test('release scripts parse and rehearsal checks package/lockfile',()=>{
  for (const file of ['validate-release.mjs','verify-package.mjs','release-notes.mjs']) {
    const result=spawnSync(process.execPath,['--check','tools/release/'+file],
      {encoding:'utf8'});
    assert.equal(result.status,0,file+': '+result.stderr);
  }
  const result=spawnSync(process.execPath,
    ['tools/release/validate-release.mjs','--rehearsal'],{encoding:'utf8'});
  assert.equal(result.status,0,result.stderr||result.stdout);
  assert.match(result.stdout,/Rehearsal validated package/);
  const invalid=spawnSync(process.execPath,
    ['tools/release/validate-release.mjs','--tag','v0.11.0'],{encoding:'utf8'});
  assert.notEqual(invalid.status,0,'Premature release tag must fail');
});
test('GitHub Releases-only guide documents manual gates',()=>{
  const docs=fs.readFileSync('docs/releasing.md','utf8');
  for (const phrase of ['bravado/metaproject','master','GitHub Releases',
    'SHA256SUMS','annotated','0.11.0','npx --no-install','private vulnerability',
    'npm pack','release.yml']) {
    assert.ok(docs.includes(phrase), 'Missing guidance: '+phrase);
  }
  assert.doesNotMatch(docs,/npm publish(?:\s|$)/);
});
