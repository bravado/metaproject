import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { initProject, detectProjectName, AGENTS_MARKER_START } from '../init/index.js';

test('init creates a complete Metaproject foundation in a Composer-only project', () => {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'metaproject-init-'));
  try {
    fs.writeFileSync(path.join(root,'composer.json'),JSON.stringify({name:'objectiveweb/db'}));
    const result=initProject({root});
    assert.equal(result.name,'DB');
    const config=fs.readFileSync(path.join(root,'metaproject.yaml'),'utf8');
    assert.match(config,/name: DB/);
    assert.match(config,/source: components/);
    assert.match(config,/output: public\/components/);
    assert.match(config,/^canvas:/m);
    assert.match(config,/- id: overview/);
    assert.match(config,/name: Overview/);
    assert.match(fs.readFileSync(path.join(root,'openapi.yaml'),'utf8'),/openapi: 3\.1\.0/);
    assert.match(fs.readFileSync(path.join(root,'openapi.yaml'),'utf8'),/title: DB API/);
    assert.ok(fs.statSync(path.join(root,'components')).isDirectory());
    assert.equal(fs.existsSync(path.join(root,'views')),false);
    const agents=fs.readFileSync(path.join(root,'AGENTS.md'),'utf8');
    assert.match(agents,new RegExp(AGENTS_MARKER_START.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
    assert.match(agents,/skills\/application-analysis\/SKILL\.md/);
    assert.match(agents,/skills\/component-authoring\/SKILL\.md/);
    assert.match(agents,/success examples small and representative/i);
    assert.doesNotMatch(agents,/canvas/i);
  } finally { fs.rmSync(root,{recursive:true,force:true}); }
});

test('init is idempotent and never overwrites existing canonical source', () => {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'metaproject-init-'));
  try {
    fs.writeFileSync(path.join(root,'metaproject.yaml'),'name: Existing\n');
    fs.writeFileSync(path.join(root,'openapi.yaml'),'existing: true\n');
    fs.writeFileSync(path.join(root,'AGENTS.md'),'# Existing instructions\n');
    initProject({root});
    initProject({root});
    assert.equal(fs.readFileSync(path.join(root,'metaproject.yaml'),'utf8'),'name: Existing\n');
    assert.equal(fs.readFileSync(path.join(root,'openapi.yaml'),'utf8'),'existing: true\n');
    const agents=fs.readFileSync(path.join(root,'AGENTS.md'),'utf8');
    assert.equal((agents.match(/<!-- metaproject:start -->/g)||[]).length,1);
    assert.match(agents,/^# Existing instructions/m);
  } finally { fs.rmSync(root,{recursive:true,force:true}); }
});

test('init --no-agents equivalent leaves AGENTS.md untouched', () => {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'metaproject-init-'));
  try {
    initProject({root,agents:false,name:'Example'});
    assert.equal(fs.existsSync(path.join(root,'AGENTS.md')),false);
  } finally { fs.rmSync(root,{recursive:true,force:true}); }
});

test('project name detection prefers package.json then composer.json then directory', () => {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'metaproject-name-'));
  try {
    assert.ok(detectProjectName(root));
    fs.writeFileSync(path.join(root,'composer.json'),JSON.stringify({name:'objectiveweb/db'}));
    assert.equal(detectProjectName(root),'DB');
    fs.writeFileSync(path.join(root,'package.json'),JSON.stringify({name:'my-admin-app'}));
    assert.equal(detectProjectName(root),'My Admin App');
  } finally { fs.rmSync(root,{recursive:true,force:true}); }
});

test('init refreshes an older bounded Metaproject AGENTS block without duplicating it', () => {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'metaproject-init-'));
  try {
    fs.writeFileSync(path.join(root,'AGENTS.md'),'# Existing\n\n<!-- metaproject:start -->\nold instructions mentioning views/\n<!-- metaproject:end -->\n');
    initProject({root,name:'Example'});
    const agents=fs.readFileSync(path.join(root,'AGENTS.md'),'utf8');
    assert.equal((agents.match(/<!-- metaproject:start -->/g)||[]).length,1);
    assert.doesNotMatch(agents,/old instructions mentioning views/);
    assert.match(agents,/application-analysis\/SKILL\.md/);
    assert.match(agents,/component-authoring\/SKILL\.md/);
    assert.doesNotMatch(agents,/canvas/i);
  } finally { fs.rmSync(root,{recursive:true,force:true}); }
});
