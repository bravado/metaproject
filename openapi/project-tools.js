import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { resolveProjectOpenApiTarget, readProjectOpenApi, writeProjectOpenApi } from './project-target.js';
import { mutateOperationDocument, mutateSchemaDocument } from './mutation-model.js';

const require = createRequire(import.meta.url);
const METHODS = ['get','put','post','delete','options','head','patch','trace'];

/** Deterministically create or update one local OpenAPI operation. */
export function upsertProjectOperation({ root = process.cwd(), values }) {
  root = path.resolve(root);
  const target = resolveProjectOpenApiTarget(root);
  const document = readProjectOpenApi(target);
  const requestedId = String(values?.previousOperationId || values?.operationId || '').trim();
  if (!values?.operationId) throw new Error('Operation input requires operationId.');
  const existing = requestedId ? findOperation(document, requestedId) : null;
  const id = values.id || existing?.raw?.['x-project-id'] || randomUUID();
  const next = {
    method: values.method || existing?.method,
    path: values.path || existing?.path,
    operationId: values.operationId || existing?.raw?.operationId,
    summary: has(values,'summary') ? values.summary : existing?.raw?.summary,
    description: has(values,'description') ? values.description : existing?.raw?.description,
    parameters: has(values,'parameters') ? values.parameters : existing?.raw?.parameters,
    requestBody: has(values,'requestBody') ? values.requestBody : existing?.raw?.requestBody,
    responses: has(values,'responses') ? values.responses : existing?.raw?.responses,
    id
  };
  mutateOperationDocument(document, existing, next);
  writeProjectOpenApi(target,document);
  return { path:target.relative, operationId:next.operationId, method:String(next.method).toUpperCase(), operationPath:next.path, id, created:!existing };
}

/** Deterministically create or update one local OpenAPI schema. */
export function upsertProjectSchema({ root = process.cwd(), values }) {
  root = path.resolve(root);
  const target = resolveProjectOpenApiTarget(root);
  const document = readProjectOpenApi(target);
  if (!values?.name) throw new Error('Schema input requires name.');
  const previousName = values.previousName || values.name;
  const existing = document?.components?.schemas?.[previousName];
  if(existing?.$ref)throw new Error(`Schema ${previousName} is a $ref; edit the referenced definition directly.`);
  const id = values.id || existing?.['x-project-id'] || randomUUID();
  const next = {
    name: values.name,
    properties: has(values,'properties') ? values.properties : existing?.properties || {},
    required: has(values,'required') ? values.required : existing?.required || [],
    id
  };
  mutateSchemaDocument(document, existing ? previousName : null, next);
  writeProjectOpenApi(target,document);
  return { path:target.relative, name:next.name, id, created:!existing };
}

export function findOperation(document, operationId) {
  for (const [operationPath, item] of Object.entries(document?.paths || {})) {
    if (!item || typeof item !== 'object') continue;
    for (const method of METHODS) {
      const raw = item[method];
      if (raw?.operationId === operationId) return { path:operationPath, method:method.toUpperCase(), raw };
    }
  }
  return null;
}

export function normalizeImportedOpenApi(document) {
  if (!document || typeof document !== 'object' || Array.isArray(document)) throw new Error('Imported OpenAPI document must be a mapping/object.');
  if (!String(document.openapi || '').startsWith('3.')) throw new Error('Metaproject currently imports OpenAPI 3.x documents.');
  document.info ||= { title:'Imported API', version:'0.0.0' };
  document.paths ||= {};
  document.components ||= {};
  document.components.schemas ||= {};

  const usedOperationIds = new Set();
  for (const [operationPath, item] of Object.entries(document.paths)) {
    if (!item || typeof item !== 'object') continue;
    for (const method of METHODS) {
      const operation = item[method];
      if (!operation || typeof operation !== 'object') continue;
      let operationId = operation.operationId || generatedOperationId(method, operationPath);
      let suffix = 2;
      const base = operationId;
      while (usedOperationIds.has(operationId)) operationId = `${base}${suffix++}`;
      operation.operationId = operationId;
      usedOperationIds.add(operationId);
      operation['x-project-id'] ||= randomUUID();
    }
  }
  for (const schema of Object.values(document.components.schemas)) {
    if (schema && typeof schema === 'object' && !Array.isArray(schema)) schema['x-project-id'] ||= randomUUID();
  }
  return document;
}

/**
 * Import an existing bundled OpenAPI 3.x document from either a local file or
 * an HTTP(S) URL. The source is copied into the configured OpenAPI file
 * and normalized with stable operation/schema IDs.
 */
export async function importProjectOpenApi({ root = process.cwd(), source, url, force = false, fetchImpl = globalThis.fetch } = {}) {
  const requested=source ?? url;
  if (!requested) throw new Error('OpenAPI import requires a file path or URL.');
  root = path.resolve(root);
  const target = resolveProjectOpenApiTarget(root);
  const current = readProjectOpenApi(target);
  if (fs.existsSync(target.file) && !force && !isEmptyLocalSpec(current)) {
    throw new Error(`${target.relative} already contains modeled API resources. Re-run with --force to replace it.`);
  }

  const loaded=await loadImportSource(requested,{fetchImpl});
  let document=parseImportedDocument(loaded.text,loaded.label);
  rejectExternalRefs(document);
  normalizeImportedOpenApi(document);
  document['x-metaproject-import-source'] = loaded.label;
  writeProjectOpenApi(target,document);
  return {
    path:target.relative,
    source:loaded.label,
    url:loaded.kind==='url'?loaded.label:null,
    operations:countOperations(document),
    schemas:Object.keys(document.components.schemas || {}).length
  };
}

async function loadImportSource(source,{fetchImpl}) {
  const value=String(source).trim();
  if (/^https?:\/\//i.test(value)) {
    if (typeof fetchImpl !== 'function') throw new Error('OpenAPI URL import requires fetch support.');
    const response=await fetchImpl(value);
    if (!response.ok) throw new Error(`Could not load OpenAPI spec (${response.status} ${response.statusText}) from ${value}`);
    return {kind:'url',label:value,text:await response.text()};
  }
  const file=value.startsWith('file:')?fileURLToPath(value):path.resolve(value);
  if (!fs.existsSync(file)) throw new Error(`OpenAPI file not found: ${value}`);
  return {kind:'file',label:file,text:fs.readFileSync(file,'utf8')};
}
function parseImportedDocument(text,label) {
  try { return JSON.parse(text); }
  catch {
    try { return yaml().parse(text); }
    catch (error) { throw new Error(`Could not parse OpenAPI document from ${label}: ${error.message}`); }
  }
}
function generatedOperationId(method, operationPath) {
  const words = String(operationPath).replace(/[{}]/g,'').split(/[^A-Za-z0-9]+/).filter(Boolean);
  const tail = words.map((word,index)=>index===0?word.toLowerCase():word[0].toUpperCase()+word.slice(1)).join('') || 'root';
  return `${method.toLowerCase()}${tail[0].toUpperCase()}${tail.slice(1)}`;
}
function countOperations(document){let count=0;for(const item of Object.values(document?.paths||{}))for(const method of METHODS)if(item?.[method]&&typeof item[method]==='object')count++;return count;}
function isEmptyLocalSpec(doc){return countOperations(doc)===0&&Object.keys(doc?.components?.schemas||{}).length===0;}
function rejectExternalRefs(value){
  if(Array.isArray(value)){for(const child of value)rejectExternalRefs(child);return;}
  if(!value||typeof value!=='object')return;
  if(typeof value.$ref==='string'&&!value.$ref.startsWith('#'))throw new Error(`OpenAPI import currently requires a bundled specification; external $ref is not supported: ${value.$ref}. Point metaproject.yaml openapi at the existing multi-file spec instead, or bundle it before importing.`);
  for(const child of Object.values(value))rejectExternalRefs(child);
}
function has(object,key){return Object.prototype.hasOwnProperty.call(object||{},key);}
function yaml(){try{return require('yaml');}catch(error){throw new Error(`Metaproject OpenAPI file tools require the yaml dependency. Reinstall metaproject with npm.\n${error.message}`);}}
