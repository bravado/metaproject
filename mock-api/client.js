import { collectMockOperations, resolveMockResponse, validateMockInvocation } from './index.js';

/**
 * Stateless OpenAPI-example transport used underneath DataSource in Canvas.
 * DataSource owns cache/invalidation; this client only resolves one invocation.
 */
export function createMockClient(openapi, options = {}) {
  const operations = new Map(collectMockOperations(openapi || {}).map(operation => [operation.operationId, operation]));
  const configuredResponses = options.responses || {};
  return Object.freeze({
    invoke(operation, args = {}) {
      const mockOperation = operations.get(operation.operationId);
      if (!mockOperation) throw new Error(`Unknown mock operation: ${operation.operationId}`);
      options.onInvoke?.(mockOperation, { args });
      validateMockInvocation(mockOperation, args, {
        allowMissingRequired: typeof options.allowMissingRequired === 'function'
          ? Boolean(options.allowMissingRequired(mockOperation, args))
          : Boolean(options.allowMissingRequired)
      });
      const selection = {
        ...(configuredResponses[mockOperation.operationId] || {}),
        ...(args.response || {})
      };
      return resolveMockResponse(openapi, mockOperation, selection, args);
    },
    get() { throw new Error('MockClient generic get() requires an OpenAPI operation. Use DataSource.api.<operationId>().'); },
    post() { throw new Error('MockClient generic post() requires an OpenAPI operation. Use DataSource.api.<operationId>().'); },
    put() { throw new Error('MockClient generic put() requires an OpenAPI operation. Use DataSource.api.<operationId>().'); },
    patch() { throw new Error('MockClient generic patch() requires an OpenAPI operation. Use DataSource.api.<operationId>().'); },
    delete() { throw new Error('MockClient generic delete() requires an OpenAPI operation. Use DataSource.api.<operationId>().'); }
  });
}
