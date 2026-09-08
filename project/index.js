export function createDefaultMetaprojectSource({ name = 'Metaproject' } = {}) {
  return `version: 1\nname: ${yamlScalar(name)}\napi_root: /api\nopenapi: openapi.yaml\ncomponents:\n  source: components\n  output: public/components\n`;
}

export function createDefaultOpenApiSource({ title = 'Metaproject API' } = {}) {
  return `openapi: 3.1.0\ninfo:\n  title: ${yamlScalar(title)}\n  version: 0.0.0\npaths: {}\ncomponents:\n  schemas: {}\n`;
}

export const DEFAULT_METAPROJECT_SOURCE = createDefaultMetaprojectSource();

// "Empty" OpenAPI means no modeled API resources yet, while remaining a valid
// OpenAPI document that parsers, validators, Canvas, and build tools can consume.
export const DEFAULT_OPENAPI_SOURCE = createDefaultOpenApiSource();

/**
 * Ensure the canonical Metaproject root files exist before parsing/indexing.
 * `filesystem` only needs async exists(path) and writeFile(path, content).
 * Existing files are never modified.
 */
export async function ensureProjectFiles(filesystem, { name = 'Metaproject', apiTitle = `${name} API` } = {}) {
  if (!filesystem || typeof filesystem.exists !== 'function' || typeof filesystem.writeFile !== 'function') {
    throw new TypeError('ensureProjectFiles requires a filesystem with exists() and writeFile().');
  }

  const created = [];

  if (!(await filesystem.exists('metaproject.yaml'))) {
    await filesystem.writeFile('metaproject.yaml', createDefaultMetaprojectSource({ name }));
    created.push('metaproject.yaml');
  }

  if (!(await filesystem.exists('openapi.yaml'))) {
    await filesystem.writeFile('openapi.yaml', createDefaultOpenApiSource({ title:apiTitle }));
    created.push('openapi.yaml');
  }

  return created;
}

// Canvas metadata is optional extension data in metaproject.yaml. These helpers
// remain here so Canvas can consume it without making Canvas a Core dependency.
export function projectCanvases(project) {
  return Array.isArray(project?.canvas) ? project.canvas : [];
}

export function canvasById(project, id) {
  return projectCanvases(project).find(canvas => canvas?.id === id) || null;
}

function yamlScalar(value) {
  const string = String(value ?? '');
  if (/^[A-Za-z0-9 _.-]+$/.test(string) && string.trim() === string && string !== '') return string;
  return JSON.stringify(string);
}

export { buildProjectIndex, relatedRelationships, componentTag } from './indexer.js';
export { checkProject } from './check.js';
