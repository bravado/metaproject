/** Pure OpenAPI object mutation helpers used by the YAML adapter. */
export function mutateOperationDocument(document, existing, values) {
  const root = requireObject(document, 'OpenAPI document root');
  const paths = ensureObjectProperty(root, 'paths', 'OpenAPI paths');

  const oldMethod = existing?.method?.toLowerCase();
  const newMethod = String(values.method || '').toLowerCase();
  if (!newMethod) throw new Error('OpenAPI operation method is required.');
  if (!values.path) throw new Error('OpenAPI operation path is required.');

  const oldPath = existing?.path;
  let operation = null;
  if (oldPath && oldMethod && paths[oldPath] != null) {
    const oldPathItem = requireObject(paths[oldPath], `OpenAPI paths.${oldPath}`);
    if (oldPathItem[oldMethod] != null) {
      operation = requireObject(oldPathItem[oldMethod], `OpenAPI operation ${oldMethod.toUpperCase()} ${oldPath}`);
    }
    if (existing && (oldPath !== values.path || oldMethod !== newMethod) && operation) {
      delete oldPathItem[oldMethod];
      if (Object.keys(oldPathItem).length === 0) delete paths[oldPath];
    }
  }

  const targetPath = ensureObjectProperty(paths, values.path, `OpenAPI paths.${values.path}`);
  if (!operation) operation = {};
  targetPath[newMethod] = operation;

  setOrDelete(operation, 'operationId', values.operationId);
  setOrDelete(operation, 'x-project-id', values.id);
  setOrDelete(operation, 'summary', values.summary || undefined);
  setOrDelete(operation, 'description', values.description || undefined);
  setOrDelete(operation, 'parameters', values.parameters?.length ? values.parameters : undefined);
  setOrDelete(operation, 'requestBody', values.requestBody || undefined);
  setOrDelete(operation, 'responses', values.responses || defaultResponses());

  return root;
}

export function mutateSchemaDocument(document, existingName, values) {
  const root = requireObject(document, 'OpenAPI document root');
  const components = ensureObjectProperty(root, 'components', 'OpenAPI components');
  const schemas = ensureObjectProperty(components, 'schemas', 'OpenAPI components.schemas');

  let schema = existingName && schemas[existingName] != null
    ? requireObject(schemas[existingName], `OpenAPI schema ${existingName}`)
    : null;

  if (existingName && existingName !== values.name && schema) delete schemas[existingName];
  if (!schema) schema = {};
  schemas[values.name] = schema;

  setOrDelete(schema, 'x-project-id', values.id);
  setOrDelete(schema, 'type', 'object');
  setOrDelete(schema, 'required', values.required?.length ? values.required : undefined);
  setOrDelete(schema, 'properties', values.properties || {});
  return root;
}

function ensureObjectProperty(parent, key, label) {
  if (parent[key] == null) parent[key] = {};
  return requireObject(parent[key], label);
}

function requireObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be a YAML mapping.`);
  }
  return value;
}

function setOrDelete(object, key, value) {
  if (value === undefined) delete object[key];
  else object[key] = value;
}

function defaultResponses() {
  return {
    '200': {
      description: 'Success',
      content: {
        'application/json': {
          examples: {
            default: { value: {} }
          }
        }
      }
    }
  };
}
