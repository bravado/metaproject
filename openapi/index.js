/**
 * Resolve external OpenAPI $ref values while preserving local references.
 *
 * The resolver is intentionally filesystem-agnostic: browser tooling can
 * resolve refs from an in-memory filesystem while the static builder can
 * resolve the same spec directly from disk.
 */
export function resolveOpenApiRefs(document, {
  sourcePath = 'openapi.yaml',
  readFile,
  parseDocument = defaultParseDocument
} = {}) {
  if (typeof readFile !== 'function') throw new Error('resolveOpenApiRefs requires readFile(path).');
  const parsed = new Map([[normalizePath(sourcePath), structuredCloneSafe(document)]]);
  const stack = new Set();

  function read(path) {
    path = normalizePath(path);
    if (parsed.has(path)) return parsed.get(path);
    const source = readFile(path);
    if (source == null) throw new Error(`OpenAPI $ref file not found: ${path}`);
    const value = parseDocument(source, path);
    parsed.set(path, value);
    return value;
  }

  function resolve(value, currentPath) {
    if (Array.isArray(value)) return value.map(child => resolve(child, currentPath));
    if (!value || typeof value !== 'object') return value;

    if (typeof value.$ref === 'string' && !value.$ref.startsWith('#')) {
      const [fileRef, pointer = ''] = value.$ref.split('#', 2);
      const targetPath = normalizeRelative(currentPath, fileRef);
      const key = `${targetPath}#${pointer}`;
      if (stack.has(key)) return structuredCloneSafe(value);
      stack.add(key);
      let target = read(targetPath);
      if (pointer) target = resolveJsonPointer(target, pointer);
      const resolved = resolve(structuredCloneSafe(target), targetPath);
      stack.delete(key);
      const siblings = Object.fromEntries(Object.entries(value).filter(([key]) => key !== '$ref'));
      return {
        ...resolved,
        ...resolve(siblings, currentPath),
        'x-source-ref': value.$ref
      };
    }

    const out = {};
    for (const [key, child] of Object.entries(value)) out[key] = resolve(child, currentPath);
    return out;
  }

  return resolve(structuredCloneSafe(document), normalizePath(sourcePath));
}

export function resolveLocalRef(document, value) {
  let current = value;
  const seen = new Set();
  while (current && typeof current === 'object' && typeof current.$ref === 'string' && current.$ref.startsWith('#')) {
    if (seen.has(current.$ref)) throw new Error(`Circular local OpenAPI reference: ${current.$ref}`);
    seen.add(current.$ref);
    const target = resolveJsonPointer(document, current.$ref.slice(1));
    const siblings = Object.fromEntries(Object.entries(current).filter(([key]) => key !== '$ref'));
    current = { ...structuredCloneSafe(target), ...structuredCloneSafe(siblings) };
  }
  return current;
}

export function resolveJsonPointer(document, pointer = '') {
  const parts = String(pointer)
    .replace(/^#/, '')
    .replace(/^\//, '')
    .split('/')
    .filter(Boolean)
    .map(part => part.replace(/~1/g, '/').replace(/~0/g, '~'));
  let current = document;
  for (const part of parts) current = current?.[part];
  if (current === undefined) throw new Error(`Unresolved OpenAPI JSON pointer: #/${parts.join('/')}`);
  return current;
}

function defaultParseDocument(source, path = '') {
  if (source && typeof source === 'object') return structuredCloneSafe(source);
  if (String(path).toLowerCase().endsWith('.json')) return JSON.parse(String(source ?? ''));
  throw new Error(`A parseDocument callback is required to resolve ${path || 'OpenAPI YAML'}.`);
}

function normalizeRelative(currentPath, ref) {
  const base = normalizePath(currentPath).split('/');
  base.pop();
  for (const part of String(ref).replace(/\\/g, '/').split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') base.pop();
    else base.push(part);
  }
  return normalizePath(base.join('/'));
}

function normalizePath(value) {
  return String(value || '').replace(/\\/g, '/').replace(/^\.\//, '');
}

function structuredCloneSafe(value) {
  return typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value));
}

export { validateOpenApiExamples, assertOpenApiExamples } from './examples.js';
export { buildOpenApiIndex, collectOperationSchemas, collectRefs } from './indexer.js';
export {
  OpenApiCredentialsError,
  collectOpenApiServers,
  resolveOpenApiServerUrl,
  collectOpenApiSecuritySchemes,
  openApiSecurityRequirements,
  applyOpenApiSecurity,
  findOpenApiOperation
} from './runtime.js';
