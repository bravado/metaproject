import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const [mode,tag]=process.argv.slice(2);
assert.ok(mode==='--rehearsal'||(mode==='--tag'&&tag),'Usage: validate-release.mjs --rehearsal | --tag vX.Y.Z');
const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));
const lock=JSON.parse(fs.readFileSync('package-lock.json','utf8'));
assert.equal(pkg.name,'metaproject','Unexpected npm package');
assert.equal(pkg.private,undefined,'Package must be public');
assert.equal(pkg.repository?.url,'git+https://github.com/metaproject/core.git');
assert.equal(pkg.license,'MIT');
assert.match(pkg.version,/^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/);
assert.equal(lock.name,pkg.name);
assert.equal(lock.version,pkg.version,'package-lock.json version mismatch');
assert.equal(lock.packages?.['']?.name,pkg.name);
assert.equal(lock.packages?.['']?.version,pkg.version,'package-lock.json root version mismatch');
for(const filename of ['LICENSE','CHANGELOG.md','CONTRIBUTING.md','SECURITY.md']){
  assert.ok(fs.statSync(filename).isFile(),filename+' missing');
}
function git(...args){
  const r=spawnSync('git',args,{encoding:'utf8'});
  assert.equal(r.status,0,'git '+args.join(' ')+': '+r.stderr);
  return r.stdout.trim();
}
if(mode==='--tag'){
  assert.match(tag,/^v(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/,'Invalid release tag');
  assert.equal(tag,'v'+pkg.version,'Tag and package versions differ');
  assert.equal(git('cat-file','-t','refs/tags/'+tag),'tag','Release must use an annotated tag');
  const tagged=git('rev-parse','refs/tags/'+tag+'^{commit}');
  assert.equal(tagged,git('rev-parse','HEAD'),'Tag is not checked out at its commit');
  git('fetch','--no-tags','origin','main');
  const main=git('rev-parse','refs/remotes/origin/main');
  assert.equal(tagged,main,'Release tag must point to current main HEAD');
  const changelog=fs.readFileSync('CHANGELOG.md','utf8');
  const escaped=pkg.version.replaceAll('.','\\.');
  assert.match(changelog,new RegExp('^## \\['+escaped+'\\]','m'));
  assert.doesNotMatch(changelog,new RegExp('^## \\['+escaped+'\\].*Planned','mi'),
    'Finalize release notes before tagging');
}
if(process.env.GITHUB_OUTPUT){
  fs.appendFileSync(process.env.GITHUB_OUTPUT,'version='+pkg.version+'\ntag=v'+pkg.version+'\n');
}
console.log((mode==='--tag'?'Validated release tag ':'Rehearsal validated package ')+pkg.version);
