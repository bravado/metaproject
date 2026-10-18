import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source=await readFile('components/data-source.js','utf8');
const form=await readFile('components/data-form.js','utf8');

test('data-operation is executed by the nearest data-source using current resource context',()=>{
  assert.match(source,/data-operation/);
  assert.match(source,/requestResourceContext\(trigger/);
  assert.match(source,/operationBodyFromResource\(operation,resource\)/);
  assert.match(source,/#parameters\(operation,resource\)/);
  assert.match(source,/operation-complete/);
  assert.doesNotMatch(source,/get save\(\)|set save\(|addEventListener\('save'/);
});

test('data-form exposes edited resource context and authored operation controls',()=>{
  assert.match(form,/new ResourceContextController\(this,\(\)=>this\._value/);
  assert.match(form,/<slot><\/slot>/);
  assert.match(form,/reportValidity\(\)/);
  assert.doesNotMatch(form,/new CustomEvent\('save'/);
  assert.doesNotMatch(form,/button type="button"/);
});
