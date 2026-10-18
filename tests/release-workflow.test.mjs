import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
import YAML from 'yaml';

const workflow=YAML.parse(fs.readFileSync('.github/workflows/release.yml','utf8'));
test('manual rehearsal is safe and only tag pushes can publish',()=>{
  assert.deepEqual(workflow.on.push.tags,['v*']);
  assert.ok(Object.hasOwn(workflow.on,'workflow_dispatch'));
  assert.equal(workflow.permissions.contents,'read');
  assert.match(workflow.jobs.guard.steps.at(-1).run,/--rehearsal/);
  const expected=String.fromCharCode(36)+"{{ github.event_name == 'push' }}";
  assert.equal(workflow.jobs.publish.if,expected);
  assert.equal(workflow.jobs['github-release'].if,expected);
  assert.equal(workflow.jobs.publish.permissions['id-token'],'write');
  assert.equal(workflow.jobs['github-release'].permissions.contents,'write');
  assert.equal(workflow.jobs.publish.needs.includes('browser'),true);
  assert.equal(workflow.jobs['github-release'].needs.includes('publish'),true);
  assert.doesNotMatch(fs.readFileSync('.github/workflows/release.yml','utf8'),/NPM_TOKEN|NODE_AUTH_TOKEN|secrets\./);
});
test('CI publishes only the exact tarball verified by pack, consumer and browser',()=>{
  const source=fs.readFileSync('.github/workflows/release.yml','utf8');
  assert.equal((source.match(/npm pack --pack-destination/g)||[]).length,1);
  assert.equal((source.match(/npm publish dist\/\*\.tgz/g)||[]).length,1);
  assert.match(source,/tests\/packed-browser-smoke\.mjs dist\/\*\.tgz/);
  assert.match(source,/node tools\/release\/registry-check\.mjs after/);
  assert.match(source,/sha256sum --check/);
  assert.match(source,/--verify-tag/);
});
test('release guard verifies manifest and lock during rehearsal',()=>{
  const r=spawnSync(process.execPath,['tools/release/validate-release.mjs','--rehearsal'],{encoding:'utf8'});
  assert.equal(r.status,0,r.stderr||r.stdout);
  assert.match(r.stdout,/Rehearsal validated package/);
  const failed=spawnSync(process.execPath,['tools/release/validate-release.mjs','--tag','v0.11.0'],{encoding:'utf8'});
  assert.notEqual(failed.status,0);
});
test('release scripts parse and npm setup is documented',()=>{
  for(const file of [
    'tools/release/validate-release.mjs',
    'tools/release/check-npm-version.mjs',
    'tools/release/verify-package.mjs',
    'tools/release/release-notes.mjs',
    'tools/release/registry-check.mjs'
  ]){
    const r=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});
    assert.equal(r.status,0,file+' '+r.stderr);
  }
  const docs=fs.readFileSync('docs/releasing.md','utf8');
  for(const name of ['release.yml','metaproject','core','two days','npm publish','0.11.0','npm audit signatures','disallow tokens']){
    assert.ok(docs.includes(name),'Missing release instruction: '+name);
  }
});
