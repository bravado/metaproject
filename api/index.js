import fs from 'node:fs';
import path from 'node:path';
import { loadProjectBuildContext } from '../build/index.js';
import { collectApiOperations } from '../operations/index.js';
import { findOpenApiOperation } from '../openapi/index.js';
import {
  RestClientError,
  configureDataRuntime,
  invokeDataRequest,
  createRestClient
} from '../data-source/index.js';

export class ApiCliError extends Error {
  constructor(message, exitCode = 1, options = {}) {
    super(message, options);
    this.name = 'ApiCliError';
    this.exitCode = exitCode;
  }
}

export async function runApiCli(args = [], io = {}) {
  const output = createIo(io);
  const argv = [...args];
  const subcommand = argv.shift() || 'help';

  if (['help', '--help', '-h'].includes(subcommand)) {
    output.stdout(apiHelp());
    return { exitCode:0 };
  }

  if (subcommand === 'list') {
    const options = parseApiReadArgs(argv, { operationRequired:false });
    if (options.help) {
      output.stdout(apiListHelp());
      return { exitCode:0 };
    }
    const context = loadApiContext(options.root);
    output.stdout(formatOperationList(context.operations));
    return { exitCode:0, operations:context.operations };
  }

  if (subcommand === 'show') {
    const options = parseApiReadArgs(argv, { operationRequired:true });
    if (options.help) {
      output.stdout(apiShowHelp());
      return { exitCode:0 };
    }
    const context = loadApiContext(options.root);
    const operation = requireOperation(context.operations, options.operationId);
    const raw = findOpenApiOperation(context.project.resolvedOpenApi, operation.operationId) || {};
    output.stdout(formatOperationDetails(operation, raw, context.project.apiRoot));
    return { exitCode:0, operation };
  }

  if (subcommand === 'call') {
    const options = parseApiCallArgs(argv);
    if (options.help) {
      output.stdout(apiCallHelp());
      return { exitCode:0 };
    }
    const context = loadApiContext(options.root);
    const operation = requireOperation(context.operations, options.operationId);
    const values = resolveOperationValues(operation, options.parameterEntries, options.namedParameters);
    const headers = Object.fromEntries(options.headers.map(parseHeader));
    const body = options.body === undefined ? undefined : readRequestBody(options.body, operation, output.readStdin);
    if (body !== undefined) ensureRequestContentType(headers, operation);
    const server = options.server || context.project.apiRoot;
    let result;
    try {
      result = await callApiOperation({
        operations:context.operations,
        operation,
        values,
        headers,
        body,
        server,
        fetchImpl:output.fetch,
        verbose:options.verbose,
        onVerbose:line => output.stderr(`${line}\n`)
      });
    } catch (error) {
      if (error instanceof ApiCliError) throw error;
      if (/missing required (?:path|query|header) parameter|request body is required/i.test(String(error?.message || ''))) {
        throw new ApiCliError(error.message, 2, { cause:error });
      }
      throw error;
    }
    const rendered = renderHttpResult(result, { include:options.include, pretty:output.isTTY });
    if (options.output && options.output !== '-') {
      fs.writeFileSync(path.resolve(options.output), rendered.body);
    } else if (rendered.body) {
      output.stdout(rendered.body.endsWith('\n') ? rendered.body : `${rendered.body}\n`);
    }
    if (!result.ok) {
      if (!result.body && !options.output) output.stderr(`HTTP ${result.status} ${result.statusText || ''}`.trimEnd() + '\n');
      return { exitCode:4, ...result };
    }
    return { exitCode:0, ...result };
  }

  throw new ApiCliError(`Unknown api command: ${subcommand}\n\n${apiHelp()}`);
}

export function loadApiContext(root = process.cwd()) {
  const project = loadProjectBuildContext(root);
  const operations = collectApiOperations(project.resolvedOpenApi);
  return { project, operations };
}

export async function callApiOperation({
  operations,
  operation,
  values = {},
  headers = {},
  body,
  server,
  fetchImpl = globalThis.fetch,
  verbose = false,
  onVerbose = () => {}
} = {}) {
  if (!operation?.operationId) throw new ApiCliError('An OpenAPI operation is required.');
  const baseUrl = requireAbsoluteHttpServer(server);
  if (typeof fetchImpl !== 'function') throw new ApiCliError('No fetch implementation is available.', 3);
  const capture = { request:null, response:null };
  const transport = async (url, init) => {
    capture.request = {
      url:String(url),
      method:String(init?.method || operation.method || 'GET'),
      headers:{ ...(init?.headers || {}) }
    };
    if (verbose) onVerbose(`> ${capture.request.method} ${capture.request.url}`);
    let response;
    try {
      response = await fetchImpl(url, init);
    } catch (error) {
      throw new ApiCliError(`Could not connect to ${url}: ${error?.message || error}`, 3, { cause:error });
    }
    capture.response = {
      status:response.status,
      statusText:response.statusText || '',
      headers:response.headers?.entries ? [...response.headers.entries()] : []
    };
    if (verbose) onVerbose(`< HTTP ${capture.response.status} ${capture.response.statusText}`.trimEnd());
    return response;
  };
  const client = createRestClient({ baseUrl, fetch:transport });
  configureDataRuntime({ operations, client });
  try {
    const responseBody = await invokeDataRequest(operation.operationId, values, { client, headers, body });
    return {
      ok:true,
      status:capture.response?.status ?? 200,
      statusText:capture.response?.statusText || '',
      headers:capture.response?.headers || [],
      body:responseBody,
      request:capture.request
    };
  } catch (error) {
    if (error instanceof RestClientError) {
      return {
        ok:false,
        status:error.status || capture.response?.status || 0,
        statusText:capture.response?.statusText || '',
        headers:capture.response?.headers || [],
        body:error.body,
        request:capture.request
      };
    }
    throw error;
  }
}

export function formatOperationList(operations = []) {
  if (!operations.length) return 'No OpenAPI operations found.\n';
  const methodWidth = Math.max(6, ...operations.map(operation => String(operation.method || '').length));
  const idWidth = Math.max(11, ...operations.map(operation => operation.operationId.length));
  return operations.map(operation =>
    `${String(operation.method || '').padEnd(methodWidth)}  ${operation.operationId.padEnd(idWidth)}  ${operation.path}`
  ).join('\n') + '\n';
}

export function formatOperationDetails(operation, raw = {}, server = '') {
  const lines = [`${operation.method} ${operation.path}`, `operationId: ${operation.operationId}`];
  if (raw.summary) lines.push(`summary: ${raw.summary}`);
  if (raw.description) lines.push(`description: ${singleLine(raw.description)}`);
  lines.push(`server: ${server || '(none)'}`);
  lines.push('', 'Parameters:');
  if (!operation.parameters?.length) lines.push('  (none)');
  else {
    for (const parameter of operation.parameters) {
      lines.push(`  --${parameter.name}  ${parameter.in}  ${schemaType(parameter.schema)}${parameter.required ? '  required' : ''}`);
    }
  }
  lines.push('', 'Request body:');
  if (!operation.requestBody) lines.push('  (none)');
  else {
    lines.push(`  ${operation.requestBody.required ? 'required' : 'optional'}`);
    for (const contentType of operation.requestBody.contentTypes || []) lines.push(`  ${contentType}`);
  }
  return `${lines.join('\n')}\n`;
}

function parseApiReadArgs(args, { operationRequired }) {
  let root = '.';
  let rootExplicit = false;
  let operationId;
  let help = false;
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--root') {
      if (!args[i + 1]) throw new ApiCliError('--root requires a directory.');
      root = args[++i];
      rootExplicit = true;
    } else if (arg === '--help' || arg === '-h') help = true;
    else if (arg.startsWith('-')) throw new ApiCliError(`Unknown api option: ${arg}`);
    else if (operationRequired && !operationId) operationId = arg;
    else if (!rootExplicit && root === '.') root = arg;
    else throw new ApiCliError(`Unexpected argument: ${arg}`);
  }
  if (operationRequired && !operationId && !help) throw new ApiCliError('api show requires an operationId.');
  return { root, operationId, help };
}

function parseApiCallArgs(args) {
  let root = '.';
  let rootExplicit = false;
  let operationId;
  let server;
  let body;
  let output;
  let include = false;
  let verbose = false;
  let help = false;
  const headers = [];
  const parameterEntries = [];
  const namedParameters = [];

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--root') {
      if (!args[i + 1]) throw new ApiCliError('--root requires a directory.');
      root = args[++i];
      rootExplicit = true;
    } else if (arg === '--server') {
      if (!args[i + 1]) throw new ApiCliError('--server requires a URL.');
      server = args[++i];
    } else if (arg === '--body') {
      if (!args[i + 1]) throw new ApiCliError('--body requires JSON, @FILE, or -.');
      body = args[++i];
    } else if (arg === '--output' || arg === '-o') {
      if (!args[i + 1]) throw new ApiCliError(`${arg} requires a file.`);
      output = args[++i];
    } else if (arg === '--header' || arg === '-H') {
      if (!args[i + 1]) throw new ApiCliError(`${arg} requires NAME: VALUE.`);
      headers.push(args[++i]);
    } else if (arg === '--param') {
      if (!args[i + 1]) throw new ApiCliError('--param requires NAME=VALUE.');
      namedParameters.push(args[++i]);
    } else if (arg === '--include' || arg === '-i') include = true;
    else if (arg === '--verbose' || arg === '-v') verbose = true;
    else if (arg === '--help' || arg === '-h') help = true;
    else if (arg.startsWith('--')) {
      const equal = arg.indexOf('=');
      if (equal > 2) parameterEntries.push([arg.slice(2, equal), arg.slice(equal + 1)]);
      else {
        if (args[i + 1] === undefined) throw new ApiCliError(`${arg} requires a value.`);
        parameterEntries.push([arg.slice(2), args[++i]]);
      }
    } else if (arg.startsWith('-')) throw new ApiCliError(`Unknown api call option: ${arg}`);
    else if (!operationId) operationId = arg;
    else if (!rootExplicit && root === '.') root = arg;
    else throw new ApiCliError(`Unexpected argument: ${arg}`);
  }

  if (!operationId && !help) throw new ApiCliError('api call requires an operationId.');
  return { root, operationId, server, body, output, include, verbose, help, headers, parameterEntries, namedParameters };
}

function resolveOperationValues(operation, entries, named) {
  const allowed = new Set((operation.parameters || []).map(parameter => parameter.name));
  const values = {};
  for (const item of named) {
    const index = item.indexOf('=');
    if (index <= 0) throw new ApiCliError(`--param requires NAME=VALUE, received: ${item}`, 2);
    assignOperationValue(values, item.slice(0, index), item.slice(index + 1), allowed, operation.operationId);
  }
  for (const [name, value] of entries) assignOperationValue(values, name, value, allowed, operation.operationId);
  return values;
}

function assignOperationValue(values, name, value, allowed, operationId) {
  if (!allowed.has(name)) {
    const available = [...allowed].map(item => `--${item}`).join(', ') || '(none)';
    throw new ApiCliError(`${operationId}: unknown parameter --${name}. Available parameters: ${available}`, 2);
  }
  if (values[name] === undefined) values[name] = value;
  else if (Array.isArray(values[name])) values[name].push(value);
  else values[name] = [values[name], value];
}

function readRequestBody(input, operation, readStdin) {
  if (!operation.requestBody) throw new ApiCliError(`${operation.operationId} does not define a request body.`, 2);
  let source;
  if (input === '-') source = readStdin();
  else if (input.startsWith('@')) source = fs.readFileSync(path.resolve(input.slice(1)), 'utf8');
  else source = input;
  const contentTypes = operation.requestBody.contentTypes || [];
  if (contentTypes.some(value => /json/i.test(value))) {
    try { JSON.parse(source); }
    catch (error) { throw new ApiCliError(`Invalid JSON request body: ${error.message}`, 2); }
  }
  return source;
}

function ensureRequestContentType(headers, operation) {
  if (Object.keys(headers).some(name => name.toLowerCase() === 'content-type')) return;
  const contentTypes = operation.requestBody?.contentTypes || [];
  const contentType = contentTypes.find(value => /json/i.test(value)) || contentTypes[0];
  if (contentType) headers['Content-Type'] = contentType;
}

function parseHeader(source) {
  const index = source.indexOf(':');
  if (index <= 0) throw new ApiCliError(`Invalid header ${JSON.stringify(source)}; expected NAME: VALUE.`, 2);
  return [source.slice(0, index).trim(), source.slice(index + 1).trim()];
}

function requireOperation(operations, operationId) {
  const operation = operations.find(item => item.operationId === operationId);
  if (operation) return operation;
  const known = operations.map(item => item.operationId).join(', ') || '(none)';
  throw new ApiCliError(`Unknown OpenAPI operation: ${operationId}. Available operations: ${known}`, 2);
}

function requireAbsoluteHttpServer(value) {
  const source = String(value || '').trim();
  let url;
  try { url = new URL(source); }
  catch {
    throw new ApiCliError(
      `OpenAPI server must be an absolute HTTP(S) URL for CLI calls: ${source || '(empty)'}. Use --server URL to override it.`
    );
  }
  if (!['http:', 'https:'].includes(url.protocol)) throw new ApiCliError(`Unsupported API server protocol: ${url.protocol}`);
  return source.replace(/\/+$/, '');
}

function renderHttpResult(result, { include, pretty }) {
  const parts = [];
  if (include) {
    parts.push(`HTTP ${result.status}${result.statusText ? ` ${result.statusText}` : ''}`);
    for (const [name, value] of result.headers || []) parts.push(`${name}: ${value}`);
    parts.push('');
  }
  const body = serializeBody(result.body, pretty);
  if (body) parts.push(body);
  return { body:parts.join('\n') };
}

function serializeBody(value, pretty) {
  if (value === undefined) return '';
  if (typeof value === 'string') return value;
  return JSON.stringify(value, null, pretty ? 2 : 0);
}

function schemaType(schema) {
  if (!schema) return 'any';
  if (Array.isArray(schema.type)) return schema.type.join('|');
  return schema.type || (schema.properties ? 'object' : 'any');
}
function singleLine(value) { return String(value || '').replace(/\s+/g, ' ').trim(); }

function createIo(io) {
  return {
    stdout:io.stdout || (value => process.stdout.write(value)),
    stderr:io.stderr || (value => process.stderr.write(value)),
    readStdin:io.readStdin || (() => fs.readFileSync(0, 'utf8')),
    fetch:io.fetch || globalThis.fetch?.bind(globalThis),
    isTTY:io.isTTY ?? Boolean(process.stdout.isTTY)
  };
}

export function apiHelp() {
  return `Metaproject API

Usage:
  metaproject api list [project-root]
  metaproject api show OPERATION [project-root]
  metaproject api call OPERATION [project-root] [parameters/options]

Use "metaproject api call --help" for call options.
`;
}
function apiListHelp() { return `Usage: metaproject api list [project-root] [--root DIR]\n`; }
function apiShowHelp() { return `Usage: metaproject api show OPERATION [project-root] [--root DIR]\n`; }
function apiCallHelp() {
  return `Usage: metaproject api call OPERATION [project-root] [options] [--PARAM VALUE ...]

Options:
  --root DIR          Metaproject project root
  --server URL        Override the first OpenAPI server
  --body VALUE        Request body: inline value, @FILE, or - for stdin
  -H, --header VALUE  Add/override a request header (NAME: VALUE)
  --param NAME=VALUE  Set an OpenAPI parameter (useful for reserved option names)
  -i, --include       Include response status and headers
  -o, --output FILE   Write response to a file
  -v, --verbose       Print request/response summary to stderr
  -h, --help          Show this help

OpenAPI path/query/header parameters are exposed directly as --PARAM flags.
`;
}
