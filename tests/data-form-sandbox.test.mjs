import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const form=await readFile('components/data-form.js','utf8');

test('auto data-form never relies on native form submission',()=>{
  assert.match(form,/role="form"/);
  assert.match(form,/<slot><\/slot>/);
  assert.match(form,/reportValidity\(\)/);
  assert.doesNotMatch(form,/<form class="form"/);
  assert.doesNotMatch(form,/type="submit"|new CustomEvent\('save'/);
});
