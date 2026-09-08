import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const form=await readFile('components/data-form.js','utf8');

test('auto data-form saves as an application action without native form submission',()=>{
  assert.match(form,/role="form"/);
  assert.match(form,/button type="button"/);
  assert.match(form,/reportValidity\(\)/);
  assert.doesNotMatch(form,/<form class="form"/);
  assert.match(form,/new CustomEvent\('save'/);
});
