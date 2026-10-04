export class RestClientError extends Error {
  constructor(message, { method, url, status, response, body } = {}) {
    super(message);
    this.name = 'RestClientError';
    this.method = method;
    this.url = url;
    this.status = status;
    this.response = response;
    this.body = body;
  }
}

export function createRestClient(options = {}) {
  const baseUrl = String(options.baseUrl ?? options.url ?? '');
  const fetchImpl = options.fetch ?? globalThis.fetch?.bind(globalThis);
  const defaultHeaders = { ...(options.headers || {}) };
  const defaultCredentials = options.credentials ?? 'same-origin';

  const request = async (method, path, requestOptions = {}) => {
    if (typeof fetchImpl !== 'function') throw new Error('No fetch implementation is available for the Metaproject REST client.');
    const headers = { ...defaultHeaders, ...(requestOptions.headers || {}) };
    const url = appendQuery(joinApiUrl(baseUrl, path), requestOptions.query || {});
    const init = {
      ...(requestOptions.request || {}),
      method,
      headers,
      credentials: requestOptions.request?.credentials ?? defaultCredentials
    };
    if (requestOptions.signal !== undefined) init.signal = requestOptions.signal;
    if (requestOptions.body !== undefined) init.body = prepareBody(requestOptions.body, requestOptions.contentTypes || [], headers);
    const response = await fetchImpl(url, init);
    const body = await readResponseBody(response);
    if (!response.ok) {
      throw new RestClientError(`${method} ${url} failed with HTTP ${response.status}`, {
        method, url, status:response.status, response, body
      });
    }
    return body;
  };

  const client = {
    baseUrl,
    request,
    get:(path, value = {}) => request('GET', path, value),
    post:(path, value = {}) => request('POST', path, value),
    put:(path, value = {}) => request('PUT', path, value),
    patch:(path, value = {}) => request('PATCH', path, value),
    delete:(path, value = {}) => request('DELETE', path, value),
    invoke(operation, args = {}) {
      validateOperation(operation, args);
      const path = expandPath(operation.path, args.path || {}, operation.operationId);
      const method = String(operation.method || 'GET').toUpperCase();
      return request(method, path, {
        query:args.query,
        headers:args.headers,
        body:args.body,
        signal:args.signal,
        request:args.request,
        contentTypes:operation.requestBody?.contentTypes || []
      });
    }
  };
  return Object.freeze(client);
}

const runtime = {
  operations:new Map(),
  client:null,
  cache:new Map(),
  subscribers:new Set(),
  epoch:0
};
const scopedRuntimes = new Map([['default', runtime]]);
function stateFor(scope = 'default') {
  scope = String(scope || 'default');
  if (!scopedRuntimes.has(scope)) scopedRuntimes.set(scope, { operations:new Map(), client:null, cache:new Map(), subscribers:new Set(), epoch:0 });
  return scopedRuntimes.get(scope);
}
const clientIds = new WeakMap();
let nextClientId = 1;

export function configureDataRuntime({ operations, client, scope = 'default' } = {}) {
  const runtime = stateFor(scope);
  if (operations !== undefined) {
    const list = Array.isArray(operations) ? operations : Object.values(operations || {});
    runtime.operations = new Map(list.filter(Boolean).map(operation => [operation.operationId, operation]));
    invalidateDataRuntime({ scope, clear:true, reason:'operations' });
  }
  if (client !== undefined) {
    runtime.client = client || null;
    invalidateDataRuntime({ scope, clear:true, reason:'client' });
  }
  return getDataRuntime(scope);
}

export function getDataRuntime(scope = 'default') {
  const runtime = stateFor(scope);
  return Object.freeze({
    client:runtime.client,
    operations:Object.freeze(Object.fromEntries(runtime.operations)),
    invoke:(operationId, values, options = {}) => invokeDataRequest(operationId, values, { ...options, scope }),
    subscribe:callback => subscribeDataRuntime(callback, { scope }),
    invalidate:options => invalidateDataRuntime({ ...options, scope })
  });
}

export function getDataOperation(operationId, scope = 'default') {
  return stateFor(scope).operations.get(String(operationId || '')) || null;
}

export function subscribeDataRuntime(callback, { scope = 'default' } = {}) {
  const runtime = stateFor(scope);
  if (typeof callback !== 'function') return () => {};
  runtime.subscribers.add(callback);
  return () => runtime.subscribers.delete(callback);
}

export function invalidateDataRuntime({ scope = 'default', clear = false, reason = 'mutation', operation = null, args = null } = {}) {
  const runtime = stateFor(scope);
  const scoped = !clear && operation && args && !['GET','HEAD'].includes(String(operation.method || '').toUpperCase());
  let invalidated = 0;

  if (clear) {
    runtime.epoch += 1;
    invalidated = runtime.cache.size;
    runtime.cache.clear();
  } else if (scoped) {
    for (const entry of runtime.cache.values()) {
      if (!mutationAffectsEntry(operation, args, entry)) continue;
      if (!entry.stale) invalidated += 1;
      entry.stale = true;
    }
  } else {
    runtime.epoch += 1;
    for (const entry of runtime.cache.values()) {
      if (!entry.stale) invalidated += 1;
      entry.stale = true;
    }
  }

  notify({
    type:'invalidate',
    reason,
    clear,
    scoped,
    operation:scoped ? operation : null,
    args:scoped ? invalidationArgs(args) : null,
    invalidated,
    epoch:runtime.epoch
  }, runtime);
}

export function invokeDataRequest(operationId, values = {}, options = {}) {
  const scope = options.scope || 'default';
  const runtime = stateFor(scope);
  const operation = getDataOperation(operationId, scope);
  if (!operation) throw new Error(`Unknown OpenAPI operation: ${operationId}`);
  const client = options.client || runtime.client;
  if (!client) throw new Error(`No client is configured for ${operation.operationId}.`);
  const args = operationArgs(operation, values, options);
  const method = String(operation.method || 'GET').toUpperCase();
  const invoke = () => invokeClient(client, operation, args);

  if (method !== 'GET' && method !== 'HEAD') return mutate(invoke, operation, args, runtime, scope);

  const key = `${clientKey(client)}:${operation.operationId}:${stableStringify({ path:args.path, query:args.query, headers:args.headers })}`;
  const existing = runtime.cache.get(key);
  if (existing && !existing.stale) {
    if (existing.status === 'success') return existing.value;
    if (existing.status === 'pending') return existing.promise;
    if (existing.status === 'error') return Promise.reject(existing.error);
  }

  const requestEpoch = runtime.epoch;
  const entry = { key, operation, args, status:'pending', stale:false, value:undefined, error:null, promise:null };
  runtime.cache.set(key, entry);
  let result;
  try { result = invoke(); }
  catch (error) {
    entry.status = 'error';
    entry.error = error;
    notify({ type:'query-error', entry, error }, runtime);
    throw error;
  }

  if (!isPromiseLike(result)) {
    entry.status = 'success';
    entry.value = result;
    entry.stale = entry.stale || requestEpoch !== runtime.epoch;
    queueMicrotask(() => notify({ type:'query', entry }, runtime));
    return result;
  }

  entry.promise = Promise.resolve(result).then(
    value => {
      entry.status = 'success';
      entry.value = value;
      entry.error = null;
      entry.stale = entry.stale || requestEpoch !== runtime.epoch;
      notify({ type:'query', entry }, runtime);
      return value;
    },
    error => {
      entry.status = 'error';
      entry.error = error;
      entry.stale = entry.stale || requestEpoch !== runtime.epoch;
      notify({ type:'query-error', entry, error }, runtime);
      throw error;
    }
  );
  return entry.promise;
}

export function selectDataSchema(schema, path = '') {
  let current = schema || null;
  for (const part of String(path || '').split('.').filter(Boolean)) {
    if (!current) return null;
    if (current.type === 'array') current = current.items || null;
    current = current?.properties?.[part] || null;
  }
  return current;
}

function operationArgs(operation, values, options) {
  const path = {}, query = {}, headers = {};
  for (const parameter of operation.parameters || []) {
    const raw = values?.[parameter.name];
    if (raw === undefined || raw === null || raw === '') {
      if (parameter.required) throw new Error(`${operation.operationId}: missing required ${parameter.in} parameter ${parameter.name}.`);
      continue;
    }
    const value = coerceParameter(raw, parameter.schema);
    if (parameter.in === 'path') path[parameter.name] = value;
    else if (parameter.in === 'query') query[parameter.name] = value;
    else if (parameter.in === 'header') headers[parameter.name] = value;
  }
  return {
    path,
    query,
    headers:{ ...headers, ...(options.headers || {}) },
    body:options.body,
    signal:options.signal,
    request:options.request,
    response:options.response
  };
}

function invokeClient(client, operation, args) {
  if (typeof client.invoke === 'function') return client.invoke(operation, args);
  const method = String(operation.method || 'GET').toLowerCase();
  const invoke = client[method];
  if (typeof invoke !== 'function') throw new Error(`Client does not implement ${method}().`);
  const path = expandPath(operation.path, args.path || {}, operation.operationId);
  return invoke.call(client, path, {
    query:args.query,
    headers:args.headers,
    body:args.body,
    signal:args.signal,
    request:args.request,
    contentTypes:operation.requestBody?.contentTypes || []
  });
}

function mutate(invoke, operation, args, runtime, scope) {
  let result;
  try { result = invoke(); }
  catch (error) {
    notify({ type:'mutation-error', operation, args, error }, runtime);
    throw error;
  }
  if (!isPromiseLike(result)) {
    invalidateDataRuntime({ scope, reason:operation.operationId, operation, args });
    notify({ type:'mutation', operation, args, value:result }, runtime);
    return result;
  }
  return Promise.resolve(result).then(
    value => {
      invalidateDataRuntime({ scope, reason:operation.operationId, operation, args });
      notify({ type:'mutation', operation, args, value }, runtime);
      return value;
    },
    error => {
      notify({ type:'mutation-error', operation, args, error }, runtime);
      throw error;
    }
  );
}

function mutationAffectsEntry(operation, args, entry) {
  if (!entry?.operation || !['GET','HEAD'].includes(String(entry.operation.method || '').toUpperCase())) return false;
  const mutationPath = concreteOperationPath(operation, args);
  const queryPath = concreteOperationPath(entry.operation, entry.args);
  if (!mutationPath || !queryPath) return false;
  if (queryPath === mutationPath) return true;

  const method = String(operation.method || '').toUpperCase();
  if (!['PATCH','PUT','DELETE'].includes(method)) return false;
  return queryPath === parentResourcePath(mutationPath);
}

function concreteOperationPath(operation, args) {
  try { return normalizeResourcePath(expandPath(operation.path, args?.path || {}, operation.operationId)); }
  catch { return ''; }
}

function normalizeResourcePath(value) {
  const path = String(value || '').split('?')[0].replace(/\/+/g,'/');
  if (!path) return '/';
  return path.length > 1 ? path.replace(/\/+$/,'') : path;
}

function parentResourcePath(value) {
  const path = normalizeResourcePath(value);
  if (path === '/') return '/';
  const index = path.lastIndexOf('/');
  return index <= 0 ? '/' : path.slice(0,index);
}

function invalidationArgs(args) {
  return { path:{ ...(args?.path || {}) } };
}

function notify(event, runtime) {
  for (const callback of [...runtime.subscribers]) {
    try { callback(event); }
    catch (error) { console.error('Metaproject data runtime subscriber failed', error); }
  }
}

function clientKey(client) {
  if ((typeof client !== 'object' || client === null) && typeof client !== 'function') return String(client);
  if (!clientIds.has(client)) clientIds.set(client, nextClientId++);
  return clientIds.get(client);
}

function coerceParameter(value, schema) {
  const type = schema?.type;
  if (type === 'integer') {
    const number = Number.parseInt(value, 10);
    return Number.isNaN(number) ? value : number;
  }
  if (type === 'number') {
    const number = Number(value);
    return Number.isNaN(number) ? value : number;
  }
  if (type === 'boolean') {
    if (value === true || value === false) return value;
    if (String(value).toLowerCase() === 'true') return true;
    if (String(value).toLowerCase() === 'false') return false;
  }
  if (type === 'array' && typeof value === 'string') return value.split(',').map(item => item.trim()).filter(Boolean);
  return value;
}

export function joinApiUrl(apiRoot, operationPath) {
  const root = String(apiRoot ?? '').replace(/\/+$/, '');
  const path = String(operationPath || '').startsWith('/') ? String(operationPath || '') : '/' + String(operationPath || '');
  if (!root || root === '/') return path || '/';
  return root + path;
}

function appendQuery(url, query) {
  const params = new URLSearchParams();
  for (const [name, raw] of Object.entries(query || {})) {
    if (raw === undefined || raw === null) continue;
    if (Array.isArray(raw)) {
      for (const value of raw) if (value !== undefined && value !== null) params.append(name, String(value));
    } else params.append(name, String(raw));
  }
  const suffix = params.toString();
  return suffix ? url + (url.includes('?') ? '&' : '?') + suffix : url;
}

function expandPath(template, values, operationId) {
  return String(template || '').replace(/\{([^}]+)\}/g, (_match, name) => {
    const value = values[name];
    if (value === undefined || value === null) throw new Error(`${operationId}: missing required path parameter ${name}.`);
    return encodeURIComponent(String(value));
  });
}

function validateOperation(operation, args) {
  const headers = args.headers || {};
  for (const parameter of operation.parameters || []) {
    if (!parameter.required) continue;
    if (parameter.in === 'header') {
      if (!hasHeader(headers, parameter.name)) throw new Error(`${operation.operationId}: missing required header parameter ${parameter.name}.`);
      continue;
    }
    const value = args[parameter.in]?.[parameter.name];
    if (value === undefined || value === null) throw new Error(`${operation.operationId}: missing required ${parameter.in} parameter ${parameter.name}.`);
  }
  if (operation.requestBody?.required && args.body === undefined) throw new Error(`${operation.operationId}: request body is required.`);
}

function prepareBody(body, contentTypes, headers) {
  if (isNativeBody(body)) return body;
  const contentType = contentTypes.find(value => /json/i.test(value)) || contentTypes[0] || 'application/json';
  if (!hasHeader(headers, 'content-type')) setHeader(headers, 'Content-Type', contentType);
  if (/json/i.test(contentType)) return JSON.stringify(body);
  if (contentType === 'application/x-www-form-urlencoded' && body && typeof body === 'object') return new URLSearchParams(body);
  return body;
}

async function readResponseBody(response) {
  if (response.status === 204 || response.status === 205) return undefined;
  const contentType = response.headers?.get?.('content-type') || '';
  if (/json/i.test(contentType)) {
    try { return await response.json(); } catch { return undefined; }
  }
  const text = await response.text();
  return text === '' ? undefined : text;
}

function isNativeBody(value) {
  if (typeof value === 'string') return true;
  if (typeof Blob !== 'undefined' && value instanceof Blob) return true;
  if (typeof FormData !== 'undefined' && value instanceof FormData) return true;
  if (typeof URLSearchParams !== 'undefined' && value instanceof URLSearchParams) return true;
  if (typeof ArrayBuffer !== 'undefined' && (value instanceof ArrayBuffer || ArrayBuffer.isView?.(value))) return true;
  return false;
}

function hasHeader(headers, name) {
  const target = String(name).toLowerCase();
  return Object.keys(headers || {}).some(key => key.toLowerCase() === target);
}
function setHeader(headers, name, value) {
  const target = String(name).toLowerCase();
  const existing = Object.keys(headers).find(key => key.toLowerCase() === target);
  headers[existing || name] = value;
}
function stableStringify(value) {
  if (value === undefined) return 'undefined';
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
}
function isPromiseLike(value) {
  return value != null && (typeof value === 'object' || typeof value === 'function') && typeof value.then === 'function';
}
