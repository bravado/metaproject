import assert from 'node:assert/strict';
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';

const [mode, tag] = process.argv.slice(2);
assert.ok(mode === '--rehearsal' || (mode === '--tag' && tag),
  'Usage: validate-release.mjs --rehearsal | --tag vX.Y.Z');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const lock = JSON.parse(fs.readFileSync('package-lock.json', 'utf8'));
assert.equal(pkg.name, 'metaproject');
assert.equal(pkg.private, undefined);
assert.equal(pkg.license, 'MIT');
assert.equal(pkg.repository?.url, 'git+https://github.com/bravado/metaproject.git');
assert.match(pkg.version, /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/);
assert.equal(lock.name, pkg.name);
assert.equal(lock.version, pkg.version, 'Lockfile version differs');
assert.equal(lock.packages?.['']?.name, pkg.name);
assert.equal(lock.packages?.['']?.version, pkg.version, 'Lockfile root version differs');
for (const name of ['LICENSE','CHANGELOG.md','CONTRIBUTING.md','SECURITY.md']) {
  assert.ok(fs.statSync(name).isFile(), 'Missing '+name);
}

function git(...args) {
  const result = spawnSync('git', args, {encoding:'utf8'});
  assert.equal(result.status, 0, 'git '+args.join(' ')+': '+result.stderr);
  return result.stdout.trim();
}

if (mode === '--tag') {
  assert.match(tag, /^v(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/);
  assert.equal(tag, 'v'+pkg.version, 'Tag version differs from package');
  assert.equal(git('cat-file','-t','refs/tags/'+tag), 'tag',
    'Only annotated release tags are permitted');
  const tagged = git('rev-parse', 'refs/tags/'+tag+'^{commit}');
  assert.equal(tagged, git('rev-parse','HEAD'), 'Tag does not match checkout');
  git('fetch','--no-tags','origin','master');
  assert.equal(tagged, git('rev-parse','FETCH_HEAD'),
    'Release tag must point to the current master HEAD');
  const changelog = fs.readFileSync('CHANGELOG.md','utf8');
  const versionPattern = pkg.version.replaceAll('.', '\\.');
  assert.match(changelog, new RegExp('^## \\['+versionPattern+'\\]', 'm'));
  assert.doesNotMatch(changelog,
    new RegExp('^## \\['+versionPattern+'\\].*Planned','mi'),
    'Finalize CHANGELOG heading before tagging');
}
if (process.env.GITHUB_OUTPUT) {
  fs.appendFileSync(process.env.GITHUB_OUTPUT,
    'version='+pkg.version+'\ntag=v'+pkg.version+'\n');
}
console.log((mode === '--tag' ? 'Validated release tag ' : 'Rehearsal validated package ')+pkg.version);
