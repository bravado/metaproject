import { collectApiOperations } from '../operations/index.js';
import { resolveLocalRef } from '../openapi/index.js';

export class MockApiError extends Error {
  constructor(message, { operationId, status, mediaType, example } = {}) {
    super(message);
    this.name='MockApiError';
    this.operationId=operationId;
    this.status=status;
    this.mediaType=mediaType;
    this.example=example;
  }
}

/** Operation facade retained for tests/tools. Component authoring uses <data-source>. */
export function createMockApi(openapi, options = {}) {
  if (!openapi || typeof openapi !== 'object') throw new Error('createMockApi requires an OpenAPI document.');
  const operations=collectMockOperations(openapi);
  const configuredResponses=options.responses || {};
  const api={};
  for (const operation of operations) {
    api[operation.operationId]=(args={})=>{
      options.onInvoke?.(operation,{args});
      validateMockInvocation(operation,args,{
        allowMissingRequired:resolveBooleanOption(options.allowMissingRequired,operation,args)
      });
      const selection={...(configuredResponses[operation.operationId]||{}),...(args.response||{})};
      const value=resolveMockResponse(openapi,operation,selection,args);
      const delay=resolveDelay(options.delay,operation,args);
      return delay>0 ? new Promise(resolve=>setTimeout(()=>resolve(value),delay)) : value;
    };
  }
  return Object.freeze(api);
}

export function collectMockOperations(openapi) {
  return collectApiOperations(openapi).map(operation=>{
    const pathItem=resolveLocalRef(openapi,openapi.paths?.[operation.path]) || {};
    const raw=resolveLocalRef(openapi,pathItem[operation.method.toLowerCase()]) || {};
    return Object.freeze({...operation,id:operation.projectId,raw});
  });
}

export function validateMockInvocation(operation,args={}, {allowMissingRequired=false}={}) {
  const values={path:args.path||{},query:args.query||{},headers:args.headers||{}};
  for (const parameter of operation.parameters||[]) {
    if (!parameter.required) continue;
    const missing=parameter.in==='header'
      ? !hasHeader(values.headers,parameter.name)
      : values[parameter.in]?.[parameter.name]===undefined || values[parameter.in]?.[parameter.name]===null;
    if (missing && !allowMissingRequired) {
      throw new MockApiError(`${operation.operationId}: missing required ${parameter.in} parameter ${parameter.name}.`,{operationId:operation.operationId});
    }
  }
  if (operation.requestBody?.required && args.body===undefined && !allowMissingRequired) {
    throw new MockApiError(`${operation.operationId}: request body is required.`,{operationId:operation.operationId});
  }
}

export function resolveMockResponse(openapi,operation,selection={},args={}) {
  const responses=operation?.raw?.responses || {};
  const [status,unresolvedResponse]=selectResponse(responses,selection.status,operation.operationId);
  const response=resolveLocalRef(openapi,unresolvedResponse) || {};
  const contentEntries=Object.entries(response.content||{});
  if (!contentEntries.length) return undefined;

  const [mediaType,content]=selectContent(contentEntries,selection.mediaType,operation.operationId,status);
  const resolvedContent=resolveLocalRef(openapi,content) || {};
  const context={operationId:operation.operationId,status,mediaType};

  if (selection.example) {
    const unresolvedExample=resolvedContent.examples?.[selection.example];
    if (!unresolvedExample) throw new MockApiError(`${operation.operationId}: example ${selection.example} was not found for response ${status} ${mediaType}.`,{...context,example:selection.example});
    const example=resolveLocalRef(openapi,unresolvedExample) || {};
    if (!Object.prototype.hasOwnProperty.call(example,'value')) throw new MockApiError(`${operation.operationId}: example ${selection.example} has no inline value.`,{...context,example:selection.example});
    return cloneValue(example.value);
  }

  const matchedExample=selectMatchedExample(openapi,resolvedContent.examples||{},args);
  if (matchedExample && Object.prototype.hasOwnProperty.call(matchedExample,'value')) return cloneValue(matchedExample.value);
  if (Object.prototype.hasOwnProperty.call(resolvedContent,'example')) return cloneValue(resolvedContent.example);

  const examples=resolvedContent.examples || {};
  const names=Object.keys(examples);
  const name=names.includes('default')?'default':names[0];
  if (name) {
    const example=resolveLocalRef(openapi,examples[name]) || {};
    if (Object.prototype.hasOwnProperty.call(example,'value')) return cloneValue(example.value);
  }
  throw new MockApiError(`${operation.operationId}: response ${status} ${mediaType} has no OpenAPI example.`,context);
}

function selectMatchedExample(openapi,examples,args) {
  for (const unresolvedExample of Object.values(examples||{})) {
    const example=resolveLocalRef(openapi,unresolvedExample) || {};
    const match=example['x-metaproject-match'];
    if (match && typeof match==='object' && matchesInvocation(match,args)) return example;
  }
  return null;
}

function matchesInvocation(match,args) {
  for (const [section,expected] of Object.entries(match||{})) {
    const actual=section==='headers'?normalizedHeaders(args?.headers||{}):args?.[section];
    const normalizedExpected=section==='headers'?normalizedHeaders(expected||{}):expected;
    if (!matchesSubset(normalizedExpected,actual)) return false;
  }
  return true;
}

function matchesSubset(expected,actual) {
  if (Array.isArray(expected)) return Array.isArray(actual) && expected.length===actual.length && expected.every((value,index)=>matchesSubset(value,actual[index]));
  if (expected && typeof expected==='object') return Boolean(actual && typeof actual==='object') && Object.entries(expected).every(([key,value])=>matchesSubset(value,actual[key]));
  return Object.is(expected,actual);
}

function normalizedHeaders(headers){const result={};for(const [key,value] of Object.entries(headers||{}))result[String(key).toLowerCase()]=value;return result;}

function selectResponse(responses,requestedStatus,operationId) {
  if (requestedStatus!==undefined && requestedStatus!==null) {
    const key=String(requestedStatus);
    if (!Object.prototype.hasOwnProperty.call(responses,key)) throw new MockApiError(`${operationId}: response ${key} does not exist.`,{operationId,status:key});
    return [key,responses[key]];
  }
  const success=Object.entries(responses).find(([status])=>/^2(?:\d\d|XX)$/i.test(String(status)));
  if (!success) throw new MockApiError(`${operationId}: no successful OpenAPI response is defined.`,{operationId});
  return success;
}

function selectContent(entries,requestedMediaType,operationId,status) {
  if (requestedMediaType) {
    const found=entries.find(([mediaType])=>mediaType===requestedMediaType);
    if (!found) throw new MockApiError(`${operationId}: response ${status} has no ${requestedMediaType} content.`,{operationId,status,mediaType:requestedMediaType});
    return found;
  }
  return entries.find(([mediaType])=>mediaType==='application/json') || entries.find(([mediaType])=>/(?:^|\+)json(?:$|;)/i.test(mediaType)) || entries[0];
}

function resolveBooleanOption(option,operation,args){return typeof option==='function'?Boolean(option(operation,args)):Boolean(option);}
function resolveDelay(option,operation,args){const raw=typeof option==='function'?option(operation,args):option;const value=Number(raw||0);return Number.isFinite(value)&&value>0?value:0;}
function hasHeader(headers,name){const target=String(name).toLowerCase();return Object.keys(headers||{}).some(key=>key.toLowerCase()===target);}
function cloneValue(value){if(typeof structuredClone==='function')return structuredClone(value);return value===undefined?undefined:JSON.parse(JSON.stringify(value));}
