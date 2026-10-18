import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';

const tracked=execFileSync('git',['ls-files','-z'],{encoding:'utf8'})
  .split('\0').filter(Boolean);
const suspiciousPath=/(?:^|\/)(?:\.env(?:\..+)?|\.npmrc|\.netrc|id_rsa|id_ed25519)$|\.(?:pem|p12|pfx|kdbx)$/i;

test('tracked files contain no obvious private credential files',()=>{
  for(const file of tracked){
    assert.doesNotMatch(file,suspiciousPath,'Potential secret file committed: '+file);
  }
});

test('tracked source has no high-confidence credential tokens',()=>{
  // Split signatures across tokens: the test itself should not resemble a secret.
  const signatures=[
    ['PEM private key',new RegExp('-----BEGIN '+'(?:RSA |EC |OPENSSH |DSA )?PRIVATE'+' KEY-----')],
    ['AWS access key',new RegExp('\\b(?:A'+'KIA|ASIA)[0-9A-Z]{16}\\b')],
    ['GitHub access token',new RegExp('\\b(?:gh'+'p_|gho_|ghs_|ghr_|github_pat_)[A-Za-z0-9_]{20,}\\b')],
    ['Google API key',new RegExp('\\bAI'+'za[0-9A-Za-z_-]{35}\\b')],
    ['Slack token',new RegExp('\\bxox'+'[bpars]-[A-Za-z0-9-]{20,}\\b')],
    ['Credentialed database URL',new RegExp('\\b(?:mysql|postgres(?:ql)?|redis|mongodb)(?:\\+\\w+)?:\\/\\/[^/\\s:@]+:[^@\\s]{8,}@','i')]
  ];
  for(const file of tracked){
    const source=fs.readFileSync(file,'utf8');
    for(const [kind,signature] of signatures){
      assert.doesNotMatch(source,signature,kind+' appears in '+file);
    }
  }
});

test('declared dependency licenses are present and recognized for legal review',()=>{
  const lock=JSON.parse(fs.readFileSync('package-lock.json','utf8'));
  // This is a metadata consistency check, NOT rights-holder/license approval.
  const declared=new Set(['MIT','BSD-3-Clause','Apache-2.0','ISC']);
  for(const [name,entry] of Object.entries(lock.packages||{})){
    if(name==='')continue;
    assert.ok(declared.has(entry.license),
      'New or missing dependency license needs legal review: '+name);
  }
});
