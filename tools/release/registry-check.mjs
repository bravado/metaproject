import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';

const [mode,version,filename]=process.argv.slice(2);
assert.ok(['before','after'].includes(mode),'registry-check: before|after version archive');
assert.match(version||'',/^\d+\.\d+\.\d+$/);
assert.ok(fs.existsSync(filename),'Release archive missing');
const url='https://registry.npmjs.org/metaproject';
async function metadata(){
  const response=await fetch(url,{headers:{Accept:'application/json'},signal:AbortSignal.timeout(25000)});
  if(response.status===404)return null;
  if(!response.ok)throw Error('npm registry lookup failed: HTTP '+response.status);
  return response.json();
}
async function check(data){
  const published=data?.versions?.[version];
  if(mode==='before'){
    if(!data)throw Error('npm metaproject does not exist; bootstrap a prerelease under an authorized npm account first');
    if(published)throw Error('metaproject@'+version+' already exists; never republish the same version');
    console.log('npm package exists and '+version+' is available for publishing');
    return;
  }
  if(!published)throw Error('metaproject@'+version+' not yet available in the registry');
  const archive=fs.readFileSync(filename);
  const sha1=createHash('sha1').update(archive).digest('hex');
  const sha512='sha512-'+createHash('sha512').update(archive).digest('base64');
  assert.equal(published.dist?.shasum,sha1,'Registry SHA-1 differs from tested tarball');
  assert.equal(published.dist?.integrity,sha512,'Registry SHA-512 differs from tested tarball');
  assert.ok(published.dist?.attestations?.provenance,'npm provenance attestation missing');
  console.log('Verified npm metaproject@'+version+', archive digests and provenance');
}
const max=mode==='after'?6:1;
for(let i=0;i<max;i++){
  const data=await metadata();
  if(mode==='before'||data?.versions?.[version]){await check(data);process.exit(0);}
  if(i+1===max)throw Error('Timed out waiting for registry publication '+version);
  await new Promise(resolve=>setTimeout(resolve,5000));
}
