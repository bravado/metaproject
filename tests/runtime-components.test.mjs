import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const runtime=await readFile('components/index.js','utf8');
const list=await readFile('tests/fixtures/components/user-list/component.html','utf8');
const detail=await readFile('tests/fixtures/components/user-detail/component.html','utf8');
const edit=await readFile('tests/fixtures/components/user-edit/component.html','utf8');

test('Metaproject runtime registers the base data-aware component library',()=>{
  assert.match(runtime,/registry\.define\('data-source'/);
  assert.match(runtime,/registry\.define\('data-table'/);
  assert.match(runtime,/registry\.define\('data-label'/);
  assert.match(runtime,/registry\.define\('form-input'/);
  assert.match(runtime,/registry\.define\('form-textarea'/);
  assert.match(runtime,/registry\.define\('form-select'/);
  assert.match(runtime,/registry\.define\('form-checkbox'/);
  assert.match(runtime,/registry\.define\('form-radio'/);
  assert.doesNotMatch(runtime,/pc-/);
});

test('data-table uses authored HTML rows and native data-action events',()=>{
  assert.match(runtime,/template\[data-row\]/);
  assert.match(runtime,/ROW_RESOURCES\.set\(root, row\)/);
  assert.match(runtime,/getAttribute\('data-action'\)/);
  assert.match(runtime,/new CustomEvent\(action/);
  assert.match(list,/<data-table[\s\S]*\.resource=\$\{api\.listUsers\(\)\}/);
  assert.match(list,/<table>[\s\S]*<template data-row>/);
  assert.match(list,/<button data-action="open">Open<\/button>/);
  assert.match(list,/@open=\$\{event => navigate\('user-detail'/);
});

test('detail component is read-only and only links to user edit',()=>{
  assert.doesNotMatch(detail,/\$\{\(\(\) =>/);
  assert.match(detail,/<component-property name="id"/);
  assert.match(detail,/api\.getUser\(\{ path: \{ id \} \}\)/);
  assert.match(detail,/@edit=\$\{event => navigate\('user-edit'/);
  assert.doesNotMatch(detail,/api\.updateUser/);
  assert.doesNotMatch(detail,/data-action="save"/);
});

test('user edit uses data-bound form controls and button-owned semantic action',()=>{
  assert.match(edit,/<form class="user-form"/);
  assert.doesNotMatch(edit,/<form[^>]*data-action/);
  assert.match(edit,/<button type="button" data-action="save" data-validate>Save<\/button>/);
  assert.match(edit,/<form-input field="name"/);
  assert.match(edit,/<form-input field="email"/);
  assert.match(edit,/<form-select field="role"/);
  assert.match(edit,/<form-radio field="contactMethod"/);
  assert.match(edit,/<form-textarea field="notes"/);
  assert.match(edit,/<form-checkbox field="active"/);
  assert.match(edit,/@save=\$\{event => api\.updateUser/);
});

test('form controls bind fields by mutating resource context and notify subscribers',()=>{
  assert.match(runtime,/export function writeDataField/);
  assert.match(runtime,/RESOURCE_CHANGE_EVENT/);
  assert.match(runtime,/class FormBoundControl extends LitElement/);
  assert.match(runtime,/writeDataField\(resource, this\.field, value\)/);
  assert.match(runtime,/new CustomEvent\('field-change'/);
  assert.match(runtime,/event\.submitter/);
  assert.match(runtime,/HTMLButtonElement/);
  assert.match(runtime,/semantic application actions/);
  assert.match(runtime,/data-validate/);
  assert.match(runtime,/validateFormControls\(event\.target\)/);
  assert.match(runtime,/reportValidity\(\)/);
});

test('data-source and data-table accept Promise resources for production API clients',()=>{
  assert.match(runtime,/isPromiseLike\(value\)/);
  assert.match(runtime,/Promise\.resolve\(value\)\.then/);
  assert.match(runtime,/data-loaded/);
  assert.match(runtime,/data-error/);
});

test('sample components rely on the canvas box title instead of rendering redundant page headers',()=>{
  assert.doesNotMatch(list,/<h[1-6]\b/i);
  assert.doesNotMatch(detail,/<h[1-6]\b/i);
  assert.doesNotMatch(edit,/<h[1-6]\b/i);
});
