const METHODS = ['get','put','post','delete','options','head','patch','trace'];

/**
 * Validate the examples required by Metaproject's design-time mock API.
 *
 * Policy: every Operation must expose at least one 2xx response. Every 2xx
 * response that contains a body must provide a concrete example for the
 * preferred media type (application/json when present, otherwise the first
 * media type). Schema-only examples are intentionally insufficient because
 * the mock runtime consumes response content examples directly.
 */
export function validateOpenApiExamples(openapi) {
  const diagnostics = [];
  for (const [operationPath, pathItem] of Object.entries(openapi?.paths || {})) {
    if (!pathItem || typeof pathItem !== 'object' || Array.isArray(pathItem)) continue;
    for (const method of METHODS) {
      const rawOperation = pathItem[method];
      if (!rawOperation || typeof rawOperation !== 'object' || Array.isArray(rawOperation)) continue;
      const operation = resolveLocalRef(openapi, rawOperation);
      const operationId = operation.operationId || `${method.toUpperCase()} ${operationPath}`;
      const successResponses = Object.entries(operation.responses || {}).filter(([status]) => /^2\d\d$/.test(String(status)));

      if (!successResponses.length) {
        diagnostics.push({
          code:'missing-success-response',
          operationId,
          method:method.toUpperCase(),
          path:operationPath,
          message:`${operationId}: ${method.toUpperCase()} ${operationPath} has no 2xx response.`
        });
        continue;
      }

      for (const [status, rawResponse] of successResponses) {
        const response = resolveLocalRef(openapi, rawResponse);
        const content = response?.content;
        if (!content || typeof content !== 'object' || Array.isArray(content) || Object.keys(content).length === 0) continue;
        const mediaType = Object.prototype.hasOwnProperty.call(content, 'application/json')
          ? 'application/json'
          : Object.keys(content)[0];
        const media = resolveLocalRef(openapi, content[mediaType]);
        const selected = selectDefaultExample(openapi, media);
        if (!selected.found) {
          diagnostics.push({
            code:'missing-success-example',
            operationId,
            method:method.toUpperCase(),
            path:operationPath,
            status:String(status),
            mediaType,
            message:`${operationId}: ${method.toUpperCase()} ${operationPath} response ${status} ${mediaType} needs an explicit example.`
          });
        } else if (!isRepresentativeValue(selected.value)) {
          diagnostics.push({
            code:'empty-success-example',
            operationId,
            method:method.toUpperCase(),
            path:operationPath,
            status:String(status),
            mediaType,
            message:`${operationId}: ${method.toUpperCase()} ${operationPath} response ${status} ${mediaType} default example is empty; provide minimal representative data.`
          });
        }
      }
    }
  }
  return diagnostics;
}

export function assertOpenApiExamples(openapi) {
  const diagnostics = validateOpenApiExamples(openapi);
  if (!diagnostics.length) return diagnostics;
  const details = diagnostics.map(item => `  - ${item.message}`).join('\n');
  throw new Error(`OpenAPI examples are incomplete:\n${details}\nAdd small representative response examples to openapi.yaml.`);
}

function selectDefaultExample(openapi, media) {
  if (!media || typeof media !== 'object' || Array.isArray(media)) return { found:false };
  if (Object.prototype.hasOwnProperty.call(media, 'example')) return { found:true, value:media.example };
  const examples = media.examples;
  if (!examples || typeof examples !== 'object' || Array.isArray(examples)) return { found:false };
  const names = Object.keys(examples);
  if (!names.length) return { found:false };
  const name = Object.prototype.hasOwnProperty.call(examples, 'default') ? 'default' : names[0];
  const example = resolveLocalRef(openapi, examples[name]);
  if (!example || typeof example !== 'object' || Array.isArray(example) || !Object.prototype.hasOwnProperty.call(example, 'value')) return { found:false };
  return { found:true, value:example.value };
}

function isRepresentativeValue(value) {
  if (value == null) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') return Object.keys(value).length > 0;
  if (typeof value === 'string') return value.trim().length > 0;
  return true;
}

function resolveLocalRef(document, value) {
  let current = value;
  const seen = new Set();
  while (current && typeof current === 'object' && !Array.isArray(current) && typeof current.$ref === 'string' && current.$ref.startsWith('#')) {
    if (seen.has(current.$ref)) return current;
    seen.add(current.$ref);
    const target = resolveJsonPointer(document, current.$ref.slice(1));
    const siblings = Object.fromEntries(Object.entries(current).filter(([key]) => key !== '$ref'));
    current = { ...clone(target), ...clone(siblings) };
  }
  return current;
}

function resolveJsonPointer(document, pointer = '') {
  const parts = String(pointer)
    .replace(/^#/, '')
    .replace(/^\//, '')
    .split('/')
    .filter(Boolean)
    .map(part => part.replace(/~1/g, '/').replace(/~0/g, '~'));
  let current = document;
  for (const part of parts) current = current?.[part];
  return current;
}

function clone(value) {
  if (value === undefined) return value;
  return typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value));
}
