import { collectApiOperations } from '../api-client/index.js';
import { resolveLocalRef } from '../openapi/index.js';

/** Error raised when an OpenAPI operation cannot be mocked deterministically. */
export class MockApiError extends Error {
  constructor(message, { operationId, status, mediaType, example } = {}) {
    super(message);
    this.name = 'MockApiError';
    this.operationId = operationId;
    this.status = status;
    this.mediaType = mediaType;
    this.example = example;
  }
}

/**
 * Build the design/test API used by Canvas from the canonical OpenAPI document.
 *
 * It deliberately has the same `api.operationId({ path, query, headers, body,
 * response })` shape as the generated production client, but never performs
 * HTTP. Successful response values come strictly from OpenAPI examples.
 */
export function createMockApi(openapi, options = {}) {
  if (!openapi || typeof openapi !== 'object') throw new Error('createMockApi requires an OpenAPI document.');
  const operations = collectMockOperations(openapi);
  const onInvoke = typeof options.onInvoke === 'function' ? options.onInvoke : null;
  const configuredResponses = options.responses || {};
  const api = {};

  for (const operation of operations) {
    api[operation.operationId] = (args = {}) => {
      // Invocation is reported before validation/example resolution so a design
      // tool can show the exact attempted operation even when the call is invalid.
      onInvoke?.(operation, { args });

      validateMockInvocation(operation, args, {
        allowMissingRequired: resolveBooleanOption(options.allowMissingRequired, operation, args)
      });

      const selection = {
        ...(configuredResponses[operation.operationId] || {}),
        ...(args.response || {})
      };
      const value = resolveMockResponse(openapi, operation, selection);
      const delay = resolveDelay(options.delay, operation, args);
      if (delay > 0) return new Promise(resolve => setTimeout(() => resolve(value), delay));
      return value;
    };
  }

  return Object.freeze(api);
}

/** Normalize OpenAPI operations for the mock runtime and invocation hooks. */
export function collectMockOperations(openapi) {
  const operations = collectApiOperations(openapi);
  return operations.map(operation => {
    const pathItem = resolveLocalRef(openapi, openapi.paths?.[operation.path]) || {};
    const raw = resolveLocalRef(openapi, pathItem[operation.method.toLowerCase()]) || {};
    return Object.freeze({
      ...operation,
      id: operation.projectId,
      raw
    });
  });
}

/** Validate the request-shaped arguments without making an HTTP request. */
export function validateMockInvocation(operation, args = {}, { allowMissingRequired = false } = {}) {
  const values = {
    path: args.path || {},
    query: args.query || {},
    headers: args.headers || {}
  };

  for (const parameter of operation.parameters || []) {
    if (!parameter.required) continue;
    const missing = parameter.in === 'header'
      ? !hasHeader(values.headers, parameter.name)
      : values[parameter.in]?.[parameter.name] === undefined || values[parameter.in]?.[parameter.name] === null;
    if (missing && !allowMissingRequired) {
      throw new MockApiError(
        `${operation.operationId}: missing required ${parameter.in} parameter ${parameter.name}.`,
        { operationId: operation.operationId }
      );
    }
  }

  if (operation.requestBody?.required && args.body === undefined && !allowMissingRequired) {
    throw new MockApiError(`${operation.operationId}: request body is required.`, { operationId: operation.operationId });
  }
}

/**
 * Resolve a successful OpenAPI response example.
 *
 * Selection may contain `{ status, mediaType, example }`. Without an explicit
 * selection the resolver chooses the first 2xx response, prefers JSON content,
 * then `content.example`, a named `default` example, or the first named example.
 * No schema-derived fake values are generated.
 */
export function resolveMockResponse(openapi, operation, selection = {}) {
  const responses = operation?.raw?.responses || {};
  const [status, unresolvedResponse] = selectResponse(responses, selection.status, operation.operationId);
  const response = resolveLocalRef(openapi, unresolvedResponse) || {};
  const contentEntries = Object.entries(response.content || {});

  // OpenAPI success responses such as 204 legitimately have no response body.
  if (!contentEntries.length) return undefined;

  const [mediaType, content] = selectContent(contentEntries, selection.mediaType, operation.operationId, status);
  const resolvedContent = resolveLocalRef(openapi, content) || {};
  const context = { operationId: operation.operationId, status, mediaType };

  if (selection.example) {
    const unresolvedExample = resolvedContent.examples?.[selection.example];
    if (!unresolvedExample) {
      throw new MockApiError(
        `${operation.operationId}: example ${selection.example} was not found for response ${status} ${mediaType}.`,
        { ...context, example: selection.example }
      );
    }
    const example = resolveLocalRef(openapi, unresolvedExample) || {};
    if (!Object.prototype.hasOwnProperty.call(example, 'value')) {
      throw new MockApiError(
        `${operation.operationId}: example ${selection.example} has no inline value.`,
        { ...context, example: selection.example }
      );
    }
    return cloneValue(example.value);
  }

  if (Object.prototype.hasOwnProperty.call(resolvedContent, 'example')) {
    return cloneValue(resolvedContent.example);
  }

  const examples = resolvedContent.examples || {};
  const names = Object.keys(examples);
  const name = names.includes('default') ? 'default' : names[0];
  if (name) {
    const example = resolveLocalRef(openapi, examples[name]) || {};
    if (Object.prototype.hasOwnProperty.call(example, 'value')) return cloneValue(example.value);
  }

  throw new MockApiError(
    `${operation.operationId}: response ${status} ${mediaType} has no OpenAPI example.`,
    context
  );
}

function selectResponse(responses, requestedStatus, operationId) {
  if (requestedStatus !== undefined && requestedStatus !== null) {
    const key = String(requestedStatus);
    if (!Object.prototype.hasOwnProperty.call(responses, key)) {
      throw new MockApiError(`${operationId}: response ${key} does not exist.`, { operationId, status:key });
    }
    return [key, responses[key]];
  }

  const success = Object.entries(responses).find(([status]) => /^2(?:\d\d|XX)$/i.test(String(status)));
  if (!success) throw new MockApiError(`${operationId}: no successful OpenAPI response is defined.`, { operationId });
  return success;
}

function selectContent(entries, requestedMediaType, operationId, status) {
  if (requestedMediaType) {
    const found = entries.find(([mediaType]) => mediaType === requestedMediaType);
    if (!found) {
      throw new MockApiError(
        `${operationId}: response ${status} has no ${requestedMediaType} content.`,
        { operationId, status, mediaType:requestedMediaType }
      );
    }
    return found;
  }
  return entries.find(([mediaType]) => mediaType === 'application/json')
    || entries.find(([mediaType]) => /(?:^|\+)json(?:$|;)/i.test(mediaType))
    || entries[0];
}

function resolveBooleanOption(option, operation, args) {
  if (typeof option === 'function') return Boolean(option(operation, args));
  return Boolean(option);
}

function resolveDelay(option, operation, args) {
  const raw = typeof option === 'function' ? option(operation, args) : option;
  const value = Number(raw || 0);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function hasHeader(headers, name) {
  const target = String(name).toLowerCase();
  return Object.keys(headers || {}).some(key => key.toLowerCase() === target);
}

function cloneValue(value) {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}
