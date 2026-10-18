import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';

const node=process.versions.node.split('.').map(Number);
assert.ok(node[0]>22||(node[0]===22&&node[1]>=14),'Trusted publishing requires Node >=22.14');
const version=execFileSync('npm',['--version'],{encoding:'utf8'}).trim();
const parts=version.split('.').map(Number);
assert.ok(parts[0]>11||(parts[0]===11&&(parts[1]>5||(parts[1]===5&&parts[2]>=1))),
  'Trusted publishing requires npm >=11.5.1; got '+version);
console.log('npm '+version+' on Node '+process.version+' supports OIDC trusted publishing');
