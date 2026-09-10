const HTTP_METHODS = ['get','put','post','delete','options','head','patch','trace'];

export class OpenApiCredentialsError extends Error {
  constructor(message, { operationId, requirements = [] } = {}) {
    super(message);
    this.name = 'OpenApiCredentialsError';
    this.operationId = operationId;
    this.requirements = requirements;
  }
}

/** Return the top-level OpenAPI servers in declaration order.
 * OpenAPI defines `/` as the implicit server when the list is absent/empty.
 */
export function collectOpenApiServers(openapi = {}) {
  const source = Array.isArray(openapi.servers) && openapi.servers.length ? openapi.servers : [{ url:'/' }];
  return source.map((unresolved, index) => {
    const server = resolveLocalReference(openapi, unresolved) || {};
    return {
      index,
      label:`Server ${index + 1}`,
      url:String(server.url || '/'),
      description:String(server.description || ''),
      variables:Object.fromEntries(Object.entries(server.variables || {}).map(([name, variable]) => [name, {
        default:variable?.default,
        enum:Array.isArray(variable?.enum) ? [...variable.enum] : [],
        description:String(variable?.description || '')
      }]))
    };
  });
}

/** Resolve `{variable}` placeholders in an OpenAPI Server Object. */
export function resolveOpenApiServerUrl(server, values = {}) {
  const template = String(server?.url || '/');
  const variables = server?.variables || {};
  return template.replace(/\{([^{}]+)\}/g, (_match, name) => {
    const supplied = values?.[name];
    const value = supplied !== undefined && supplied !== null && supplied !== '' ? supplied : variables?.[name]?.default;
    if (value === undefined || value === null) throw new Error(`OpenAPI server variable ${name} has no value or default.`);
    return String(value);
  });
}

/** Return resolved Security Scheme Objects declared under components.securitySchemes. */
export function collectOpenApiSecuritySchemes(openapi = {}) {
  return Object.entries(openapi?.components?.securitySchemes || {}).map(([name, unresolved]) => ({
    name,
    scheme:resolveLocalReference(openapi, unresolved) || {}
  }));
}

/** Resolve the effective Security Requirement Object list for an operation. */
export function openApiSecurityRequirements(openapi = {}, operation = {}) {
  if (Object.prototype.hasOwnProperty.call(operation || {}, 'security')) {
    return Array.isArray(operation.security) ? operation.security : [];
  }
  return Array.isArray(openapi.security) ? openapi.security : [];
}

/**
 * Apply OpenAPI security semantics to one operation invocation.
 *
 * `credentials` is keyed by security-scheme name. The returned `args` can be
 * passed directly to the REST client. Cookie API keys and mutual TLS are
 * returned as transport metadata because browser fetch cannot set Cookie or a
 * client certificate directly.
 */
export function applyOpenApiSecurity({ openapi = {}, operation = {}, args = {}, credentials = {} } = {}) {
  const requirements = openApiSecurityRequirements(openapi, operation);
  const base = cloneArgs(args);
  if (!requirements.length) return { args:base, transport:{}, requirement:null };

  const schemes = new Map(collectOpenApiSecuritySchemes(openapi).map(item => [item.name, item.scheme]));
  const failures = [];

  for (const requirement of requirements) {
    if (!requirement || typeof requirement !== 'object') continue;
    const names = Object.keys(requirement);
    if (!names.length) return { args:base, transport:{}, requirement:{} };

    const secured = cloneArgs(base);
    const transport = {};
    const missing = [];
    let invalid = null;

    for (const name of names) {
      const scheme = schemes.get(name);
      if (!scheme) {
        invalid = `Security requirement references unknown scheme ${name}.`;
        break;
      }
      try {
        applyScheme(name, scheme, credentials?.[name], secured, transport);
      } catch (error) {
        if (error?.code === 'MISSING_CREDENTIALS') missing.push(name);
        else { invalid = error?.message || String(error); break; }
      }
    }

    if (!invalid && !missing.length) return { args:secured, transport, requirement };
    failures.push({ requirement, missing, error:invalid });
  }

  const operationId = operation?.operationId || '';
  const missing = [...new Set(failures.flatMap(item => item.missing))];
  const detail = missing.length ? ` Missing credentials: ${missing.join(', ')}.` : '';
  const invalid = failures.map(item => item.error).filter(Boolean)[0];
  throw new OpenApiCredentialsError(
    invalid || `${operationId || 'OpenAPI operation'} requires authentication.${detail}`,
    { operationId, requirements }
  );
}

/** Find the raw Operation Object for an operationId. */
export function findOpenApiOperation(openapi = {}, operationId = '') {
  for (const unresolvedPathItem of Object.values(openapi.paths || {})) {
    const pathItem = resolveLocalReference(openapi, unresolvedPathItem) || {};
    for (const method of HTTP_METHODS) {
      if (!pathItem[method]) continue;
      const operation = resolveLocalReference(openapi, pathItem[method]) || {};
      if (operation.operationId === operationId) return operation;
    }
  }
  return null;
}

function applyScheme(name, scheme, credential, args, transport) {
  const type = String(scheme?.type || '');

  if (type === 'apiKey') {
    const value = credentialValue(credential);
    requireValue(name, value);
    if (scheme.in === 'header') args.headers[String(scheme.name)] = value;
    else if (scheme.in === 'query') args.query[String(scheme.name)] = value;
    else if (scheme.in === 'cookie') {
      transport.cookies ||= {};
      transport.cookies[String(scheme.name)] = value;
    } else throw new Error(`Unsupported apiKey location for ${name}: ${scheme.in}`);
    return;
  }

  if (type === 'http') {
    const protocol = String(scheme.scheme || '').toLowerCase();
    if (protocol === 'basic') {
      const username = objectCredential(credential)?.username;
      const password = objectCredential(credential)?.password ?? '';
      requireValue(name, username);
      args.headers.Authorization = `Basic ${encodeBase64Utf8(`${username}:${password}`)}`;
      return;
    }
    if (protocol === 'bearer') {
      const token = tokenValue(credential);
      requireValue(name, token);
      args.headers.Authorization = `Bearer ${token}`;
      return;
    }
    const configured = objectCredential(credential);
    const raw = configured?.authorization;
    const value = raw || credentialValue(credential);
    requireValue(name, value);
    args.headers.Authorization = raw || `${scheme.scheme} ${value}`.trim();
    return;
  }

  if (type === 'oauth2' || type === 'openIdConnect') {
    const token = tokenValue(credential);
    requireValue(name, token);
    args.headers.Authorization = `Bearer ${token}`;
    return;
  }

  if (type === 'mutualTLS') {
    const configured = objectCredential(credential);
    const certificate = configured?.certificate ?? configured?.cert;
    const key = configured?.key;
    if (!certificate || !key) throw missingCredentials(name);
    transport.tls = {
      certificate:String(certificate),
      key:String(key),
      ...(configured?.passphrase ? { passphrase:String(configured.passphrase) } : {})
    };
    return;
  }

  throw new Error(`Unsupported OpenAPI security scheme type for ${name}: ${type || '(missing)'}`);
}

function cloneArgs(args) {
  return {
    ...(args || {}),
    path:{ ...(args?.path || {}) },
    query:{ ...(args?.query || {}) },
    headers:{ ...(args?.headers || {}) },
    ...(args?.request ? { request:{ ...args.request } } : {})
  };
}

function credentialValue(value) {
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  const configured = objectCredential(value);
  const result = configured?.value ?? configured?.token ?? configured?.accessToken;
  return result === undefined || result === null ? '' : String(result);
}
function tokenValue(value) {
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  const configured = objectCredential(value);
  const result = configured?.token ?? configured?.accessToken ?? configured?.value;
  return result === undefined || result === null ? '' : String(result);
}
function objectCredential(value) { return value && typeof value === 'object' && !Array.isArray(value) ? value : null; }
function requireValue(name, value) { if (value === undefined || value === null || value === '') throw missingCredentials(name); }
function missingCredentials(name) { const error = new Error(`Missing credentials for ${name}.`); error.code = 'MISSING_CREDENTIALS'; return error; }

function encodeBase64Utf8(value) {
  const bytes = new TextEncoder().encode(String(value));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  if (typeof globalThis.btoa === 'function') return globalThis.btoa(binary);
  if (typeof globalThis.Buffer !== 'undefined') return globalThis.Buffer.from(bytes).toString('base64');
  throw new Error('No base64 encoder is available for HTTP Basic authentication.');
}

function resolveLocalReference(document, value) {
  let current = value;
  const seen = new Set();
  while (current && typeof current === 'object' && typeof current.$ref === 'string' && current.$ref.startsWith('#')) {
    if (seen.has(current.$ref)) throw new Error(`Circular local OpenAPI reference: ${current.$ref}`);
    seen.add(current.$ref);
    const target = resolvePointer(document, current.$ref.slice(1));
    const siblings = Object.fromEntries(Object.entries(current).filter(([key]) => key !== '$ref'));
    current = { ...clone(target), ...clone(siblings) };
  }
  return current;
}
function resolvePointer(document, pointer = '') {
  const parts = String(pointer).replace(/^\//, '').split('/').filter(Boolean).map(part => part.replace(/~1/g, '/').replace(/~0/g, '~'));
  let current = document;
  for (const part of parts) current = current?.[part];
  if (current === undefined) throw new Error(`Unresolved OpenAPI JSON pointer: #/${parts.join('/')}`);
  return current;
}
function clone(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }
