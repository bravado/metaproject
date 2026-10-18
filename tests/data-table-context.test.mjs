import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile('components/data-table.js','utf8');

test('data-table lets its own context request reach the parent provider',()=>{
  assert.match(source,/#provideContext\(event\)\s*\{\s*if \(event\.target === this\) return;/);
});

test('data-table still provides row context to descendants',()=>{
  assert.match(source,/const context=this\.#rowContext\(event\)/);
  assert.match(source,/event\.stopPropagation\(\)/);
  assert.match(source,/detail\.callback\(context\.resource,context\.schema\)/);
});
