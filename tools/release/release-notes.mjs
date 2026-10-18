import assert from 'node:assert/strict';
import fs from 'node:fs';

const version = process.argv[2];
assert.match(version || '', /^\d+\.\d+\.\d+$/, 'Expected a release version');
const changelog = fs.readFileSync('CHANGELOG.md','utf8');
const heading = new RegExp('^## \\['+version.replaceAll('.','\\.')+'\\].*$', 'm');
const start = changelog.search(heading);
assert.ok(start >= 0,'Missing changelog section for '+version);
const tail = changelog.slice(start);
const next = tail.slice(1).search(/\n## \[/);
const section = (next === -1 ? tail : tail.slice(0,next+1)).trim();
assert.doesNotMatch(section.split('\n')[0],/Planned/i,'Release notes not finalized');
const body = section.replace(/^## [^\n]+\n/,'').trim();
assert.ok(body.length > 40, 'Missing release notes');
process.stdout.write(body+'\n');
