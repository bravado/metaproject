export const DATA_SOURCE_CONTEXT_REQUEST = 'metaproject-data-source-context-request';

let defaultDataSource = null;

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
    const query = requestOptions.query || {};
    const headers = { ...defaultHeaders, ...(requestOptions.headers || {}) };
    const url = appendQuery(joinApiUrl(baseUrl, path), query);
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
      const method = String(operation.method || 'GET').toLowerCase();
      const invoke = client[method];
      if (typeof invoke !== 'function') throw new Error(`Unsupported REST method: ${operation.method}`);
      return invoke(path, {
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

export class DataSourceStore {
  constructor({ client, url, operations = [], fetch, headers, credentials } = {}) {
    this.client = client || createRestClient({ baseUrl:url || '', fetch, headers, credentials });
    this.operations = [];
    this.operationById = new Map();
    this.cache = new Map();
    this.subscribers = new Set();
    this.epoch = 0;
    this.setOperations(operations, { notify:false });
    this.api = this.#buildApi();
  }

  setOperations(operations = [], { notify = true } = {}) {
    this.operations = Array.isArray(operations) ? [...operations] : Object.values(operations || {});
    this.operationById = new Map(this.operations.filter(Boolean).map(operation => [operation.operationId, operation]));
    this.api = this.#buildApi();
    if (notify) this.clear();
    return this;
  }

  setClient(client, { clear = true } = {}) {
    if (!client) throw new Error('DataSource.setClient requires a client.');
    if (client === this.client) return this;
    this.client = client;
    if (clear) this.clear();
    else this.#notify({ type:'client', source:this });
    return this;
  }

  subscribe(callback) {
    if (typeof callback !== 'function') return () => {};
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }

  clear() {
    this.epoch += 1;
    this.cache.clear();
    this.#notify({ type:'clear', source:this });
    return this;
  }

  invalidate(predicate = null) {
    this.epoch += 1;
    let count = 0;
    for (const [key, entry] of this.cache) {
      if (predicate && !matchesInvalidation(predicate, entry, key)) continue;
      entry.stale = true;
      count += 1;
    }
    this.#notify({ type:'invalidate', source:this, count });
    return count;
  }

  refresh(predicate = null) {
    return this.invalidate(predicate);
  }

  get(path, options = {}) { return this.#query(`GET:${stableStringify({path,query:options.query,headers:options.headers})}`, { method:'GET', path, args:options }, () => this.client.get(path, options)); }
  post(path, options = {}) { return this.#mutate(() => this.client.post(path, options)); }
  put(path, options = {}) { return this.#mutate(() => this.client.put(path, options)); }
  patch(path, options = {}) { return this.#mutate(() => this.client.patch(path, options)); }
  delete(path, options = {}) { return this.#mutate(() => this.client.delete(path, options)); }

  invoke(operationId, args = {}) {
    const operation = typeof operationId === 'string' ? this.operationById.get(operationId) : operationId;
    if (!operation) throw new Error(`Unknown OpenAPI operation: ${typeof operationId === 'string' ? operationId : operationId?.operationId}`);
    const method = String(operation.method || 'GET').toUpperCase();
    const invoke = () => {
      if (typeof this.client?.invoke === 'function') return this.client.invoke(operation, args);
      const path = expandPath(operation.path, args.path || {}, operation.operationId);
      const clientMethod = this.client?.[method.toLowerCase()];
      if (typeof clientMethod !== 'function') throw new Error(`DataSource client does not implement ${method.toLowerCase()}().`);
      return clientMethod.call(this.client, path, {
        query:args.query, headers:args.headers, body:args.body, signal:args.signal,
        request:args.request, contentTypes:operation.requestBody?.contentTypes || []
      });
    };
    if (method === 'GET' || method === 'HEAD') {
      const key = `OP:${operation.operationId}:${stableStringify({path:args.path,query:args.query,headers:args.headers,response:args.response})}`;
      return this.#query(key, { operation, args }, invoke);
    }
    return this.#mutate(invoke, { operation, args });
  }

  #buildApi() {
    const api = {
      get:(path, options = {}) => this.get(path, options),
      post:(path, options = {}) => this.post(path, options),
      put:(path, options = {}) => this.put(path, options),
      patch:(path, options = {}) => this.patch(path, options),
      delete:(path, options = {}) => this.delete(path, options)
    };
    for (const operation of this.operations || []) {
      if (!operation?.operationId) continue;
      api[operation.operationId] = (args = {}) => this.invoke(operation, args);
    }
    return Object.freeze(api);
  }

  #query(key, meta, load) {
    const existing = this.cache.get(key);
    if (existing && !existing.stale) {
      if (existing.status === 'success') return existing.value;
      if (existing.status === 'pending') return existing.promise;
      if (existing.status === 'error') return Promise.reject(existing.error);
    }

    const requestEpoch = this.epoch;
    const entry = { key, ...meta, status:'pending', stale:false, value:undefined, error:null, promise:null };
    this.cache.set(key, entry);
    let result;
    try { result = load(); }
    catch (error) {
      entry.status = 'error';
      entry.error = error;
      this.#notify({ type:'query-error', source:this, entry, error });
      throw error;
    }

    if (!isPromiseLike(result)) {
      entry.status = 'success';
      entry.value = result;
      entry.stale = requestEpoch !== this.epoch;
      queueMicrotask(() => this.#notify({ type:'query', source:this, entry }));
      return result;
    }

    entry.promise = Promise.resolve(result).then(
      value => {
        entry.status = 'success';
        entry.value = value;
        entry.error = null;
        entry.stale = requestEpoch !== this.epoch;
        this.#notify({ type:'query', source:this, entry });
        return value;
      },
      error => {
        entry.status = 'error';
        entry.error = error;
        entry.stale = requestEpoch !== this.epoch;
        this.#notify({ type:'query-error', source:this, entry, error });
        throw error;
      }
    );
    return entry.promise;
  }

  #mutate(invoke, meta = {}) {
    let result;
    try { result = invoke(); }
    catch (error) {
      this.#notify({ type:'mutation-error', source:this, ...meta, error });
      throw error;
    }
    if (!isPromiseLike(result)) {
      this.invalidate();
      this.#notify({ type:'mutation', source:this, ...meta, value:result });
      return result;
    }
    return Promise.resolve(result).then(
      value => {
        this.invalidate();
        this.#notify({ type:'mutation', source:this, ...meta, value });
        return value;
      },
      error => {
        this.#notify({ type:'mutation-error', source:this, ...meta, error });
        throw error;
      }
    );
  }

  #notify(event) {
    for (const callback of [...this.subscribers]) {
      try { callback(event); }
      catch (error) { console.error('Metaproject DataSource subscriber failed', error); }
    }
  }
}

export function createDataSource(options = {}) {
  return options instanceof DataSourceStore ? options : new DataSourceStore(options);
}

export function setDefaultDataSource(source) {
  defaultDataSource = source || null;
  return defaultDataSource;
}

export function getDefaultDataSource() {
  return defaultDataSource;
}

export function requestDataSourceContext(host, callback, { subscribe = false } = {}) {
  if (!host?.dispatchEvent || typeof CustomEvent === 'undefined') {
    callback?.(defaultDataSource);
    return () => {};
  }
  const detail = { callback, subscribe, unsubscribe:null };
  host.dispatchEvent(new CustomEvent(DATA_SOURCE_CONTEXT_REQUEST, { detail, bubbles:true, composed:true }));
  if (!detail.resolved && defaultDataSource && typeof callback === 'function') callback(defaultDataSource);
  return typeof detail.unsubscribe === 'function' ? detail.unsubscribe : () => {};
}

export class DataSourceConsumerController {
  constructor(host) {
    this.host = host;
    this.contextSource = null;
    this.explicitSource = null;
    this.fallbackSource = null;
    this.boundSource = null;
    this.contextUnsubscribe = null;
    this.sourceUnsubscribe = null;
    host.addController?.(this);
  }

  hostConnected() {
    queueMicrotask(() => {
      if (!this.host?.isConnected) return;
      this.contextUnsubscribe?.();
      this.contextUnsubscribe = requestDataSourceContext(this.host, source => {
        this.contextSource = source || null;
        this.#rebind();
        this.host.requestUpdate?.();
      }, { subscribe:true });
      this.#rebind();
    });
  }

  hostDisconnected() {
    this.contextUnsubscribe?.();
    this.contextUnsubscribe = null;
    this.sourceUnsubscribe?.();
    this.sourceUnsubscribe = null;
    this.boundSource = null;
  }

  resolve(explicitSource, fallbackSource = null) {
    this.explicitSource = explicitSource || null;
    this.fallbackSource = fallbackSource || null;
    this.#rebind();
    return this.boundSource;
  }

  #rebind() {
    const next = this.explicitSource || this.contextSource || this.fallbackSource || defaultDataSource || null;
    if (next === this.boundSource) return;
    this.sourceUnsubscribe?.();
    this.sourceUnsubscribe = null;
    this.boundSource = next;
    if (typeof next?.subscribe === 'function') {
      this.sourceUnsubscribe = next.subscribe(() => this.host.requestUpdate?.());
    }
  }
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
    if (Array.isArray(raw)) for (const value of raw) if (value !== undefined && value !== null) params.append(name, String(value));
    else params.append(name, String(raw));
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
function isPromiseLike(value) { return Boolean(value && typeof value.then === 'function'); }
function matchesInvalidation(predicate, entry, key) {
  if (typeof predicate === 'function') return Boolean(predicate(entry, key));
  if (typeof predicate === 'string') return key.includes(predicate) || entry.operation?.operationId === predicate;
  if (Array.isArray(predicate)) return predicate.some(value => matchesInvalidation(value, entry, key));
  return true;
}
function stableStringify(value) {
  if (value === undefined) return 'undefined';
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']';
  return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + stableStringify(value[key])).join(',') + '}';
}
