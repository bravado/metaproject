import { parse, stringify } from 'yaml';
import { DEFAULT_OPENAPI_SOURCE } from '../project/index.js';
import { mutateOperationDocument, mutateEntityDocument } from './mutation-model.js';

/**
 * YAML adapter for structured OpenAPI editing.
 *
 * Mutation intentionally happens on the parsed JavaScript object rather than
 * through nested YAML document path mutation. OpenAPI path strings are map keys, and object
 * mutation avoids yaml's intermediate-Collection requirements entirely.
 */
export function upsertOperationYaml(source, existing, values) {
  const document = parseOpenApiYaml(source);
  mutateOperationDocument(document, existing, values);
  return stringify(document);
}

export function upsertEntityYaml(source, existingName, values) {
  const document = parseOpenApiYaml(source);
  mutateEntityDocument(document, existingName, values);
  return stringify(document);
}

function parseOpenApiYaml(source) {
  const text = String(source ?? '');
  const document = parse(text.trim() ? text : DEFAULT_OPENAPI_SOURCE);
  if (!document || typeof document !== 'object' || Array.isArray(document)) {
    throw new Error('OpenAPI document root must be a YAML mapping.');
  }
  return document;
}
