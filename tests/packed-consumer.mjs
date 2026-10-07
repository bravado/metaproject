import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const tarballArg=process.argv[2];
if(!tarballArg) throw new Error('Usage: node tests/packed-consumer.mjs <metaproject.tgz>');

const checkout=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const tarball=path.resolve(tarballArg);
assert.ok(fs.existsSync(tarball),`Packed tarball not found: ${tarball}`);

const temp=fs.mkdtempSync(path.join(os.tmpdir(),'metaproject-packed-consumer-'));
const consumer=path.join(temp,'consumer');
fs.mkdirSync(consumer,{recursive:true});

const npm=process.platform==='win32'?'npm.cmd':'npm';
const binName=process.platform==='win32'?'metaproject.cmd':'metaproject';

function run(command,args,{cwd=consumer,input}={}){
  const result=spawnSync(command,args,{cwd,encoding:'utf8',input});
  assert.equal(
    result.status,
    0,
    [`Command failed: ${command} ${args.join(' ')}`,result.stdout,result.stderr].filter(Boolean).join('\n')
  );
  return result;
}

function assertExists(relativePath){
  const absolute=path.join(consumer,relativePath);
  assert.ok(fs.existsSync(absolute),`Expected installed consumer path: ${relativePath}`);
  return absolute;
}

try {
  fs.writeFileSync(
    path.join(consumer,'package.json'),
    JSON.stringify({name:'metaproject-packed-consumer',private:true,type:'module'},null,2)
  );

  run(npm,['install','--ignore-scripts','--no-audit','--no-fund','--no-package-lock',tarball]);

  const installedRoot=assertExists('node_modules/metaproject');
  const cli=assertExists(path.join('node_modules','.bin',binName));
  if(process.platform!=='win32') fs.accessSync(cli,fs.constants.X_OK);

  const packageJson=JSON.parse(fs.readFileSync(path.join(installedRoot,'package.json'),'utf8'));
  const version=run(cli,['--version']).stdout.trim();
  assert.equal(version,packageJson.version);

  const init=run(cli,['init']);
  assert.match(init.stdout,/Initialized Metaproject/);
  for(const file of ['metaproject.yaml','openapi.yaml','AGENTS.md']) assertExists(file);
  assert.ok(fs.statSync(assertExists('components')).isDirectory());

  const agents=fs.readFileSync(path.join(consumer,'AGENTS.md'),'utf8');
  const agentSkillRefs=[...agents.matchAll(/node_modules\/metaproject\/(skills\/[A-Za-z0-9_./-]+\.md)/g)].map(match=>match[1]);
  assert.ok(agentSkillRefs.length>=3,'AGENTS.md should reference packaged Metaproject skills');
  for(const relative of new Set(agentSkillRefs)) {
    assert.ok(fs.existsSync(path.join(installedRoot,relative)),`AGENTS.md reference does not resolve: ${relative}`);
  }

  const skillsDir=path.join(installedRoot,'skills');
  const skillFiles=[];
  for(const entry of fs.readdirSync(skillsDir,{withFileTypes:true})){
    if(!entry.isDirectory()) continue;
    const skill=path.join(skillsDir,entry.name,'SKILL.md');
    if(fs.existsSync(skill)) skillFiles.push(skill);
  }
  assert.ok(skillFiles.length>=5,'Expected all shipped skills in packed package');
  for(const skill of skillFiles){
    const source=fs.readFileSync(skill,'utf8');
    for(const match of source.matchAll(/`(docs\/[A-Za-z0-9_./-]+\.md)`/g)){
      assert.ok(
        fs.existsSync(path.join(installedRoot,match[1])),
        `Packaged skill references missing document: ${match[1]}`
      );
    }
  }

  const sourceSpec=path.join(consumer,'source-openapi.yaml');
  fs.writeFileSync(sourceSpec,`openapi: 3.1.0
info:
  title: Packed consumer API
  version: 1.0.0
servers:
  - url: /api
paths:
  /users:
    get:
      operationId: listUsers
      x-project-id: op-list-users
      responses:
        '200':
          description: Users
          content:
            application/json:
              schema:
                type: array
                items:
                  $ref: '#/components/schemas/User'
              example:
                - { id: 1, name: Ada }
components:
  schemas:
    User:
      x-project-id: schema-user
      type: object
      properties:
        id: { type: integer }
        name: { type: string }
      required: [id, name]
`);

  const imported=run(cli,['import-openapi',sourceSpec]);
  assert.match(imported.stdout,/Imported OpenAPI/);

  const componentDir=path.join(consumer,'components','user-list');
  fs.mkdirSync(componentDir,{recursive:true});
  fs.writeFileSync(
    path.join(componentDir,'component.html'),
    '<title>Users</title>\n<data-source request="listUsers"><data-table></data-table></data-source>\n'
  );

  const check=run(cli,['check']);
  assert.match(check.stdout,/Health:\s+0 error\(s\)/);

  run(cli,['build']);
  for(const file of ['index.js','all.js','api.js','user-list.js','manifest.json']){
    assertExists(path.join('public','components',file));
  }

  const exportNames=Object.keys(packageJson.exports||{});
  assert.ok(exportNames.length>0,'Installed package should declare public exports');
  const exportScript=`
    import assert from 'node:assert/strict';
    import { access } from 'node:fs/promises';
    const checkout=${JSON.stringify(checkout)};
    const specifiers=${JSON.stringify(exportNames.map(name=>`metaproject/${name.slice(2)}`))};
    for(const specifier of specifiers){
      const resolved=import.meta.resolve(specifier);
      assert.ok(resolved.includes('/node_modules/metaproject/'), specifier+' did not resolve from installed package');
      assert.ok(!resolved.startsWith('file://'+checkout+'/'), specifier+' resolved into repository checkout');
      await access(new URL(resolved));
    }
    for(const specifier of[
      'metaproject/data-source',
      'metaproject/compiler',
      'metaproject/vite',
      'metaproject/openapi',
      'metaproject/project'
    ]) await import(specifier);
  `;
  run(process.execPath,['--input-type=module','--eval',exportScript]);

  const outputDir=path.join(consumer,'public','components');
  for(const entry of fs.readdirSync(outputDir)){
    if(!entry.endsWith('.js')) continue;
    const source=fs.readFileSync(path.join(outputDir,entry),'utf8');
    const specifiers=[
      ...source.matchAll(/\bfrom\s*['"]([^'"]+)['"]/g),
      ...source.matchAll(/\bimport\s*['"]([^'"]+)['"]/g),
      ...source.matchAll(/\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g)
    ].map(match=>match[1]);
    for(const specifier of specifiers){
      assert.ok(
        specifier.startsWith('.') || specifier.startsWith('/') || /^(?:https?:|data:)/.test(specifier),
        `Generated asset ${entry} contains unresolved npm import: ${specifier}`
      );
    }
  }

  console.log(`Packed consumer verified: ${path.basename(tarball)}`);
} finally {
  fs.rmSync(temp,{recursive:true,force:true});
}
