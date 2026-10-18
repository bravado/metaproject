import { collectMockOperations, resolveMockResponse, validateMockInvocation } from './index.js';

/**
 * Stateful OpenAPI-example transport for development and tests. Reads start from the
 * canonical examples and then apply successful mutations made through this
 * client, so invalidation/refetch behaves like a real backend.
 */
export function createMockClient(openapi, options = {}) {
  const operations=new Map(collectMockOperations(openapi||{}).map(operation=>[operation.operationId,operation]));
  const configuredResponses=options.responses || {};
  const mutations=[];

  return Object.freeze({
    invoke(operation,args={}) {
      const mockOperation=operations.get(operation.operationId);
      if(!mockOperation)throw new Error(`Unknown mock operation: ${operation.operationId}`);
      options.onInvoke?.(mockOperation,{args});
      validateMockInvocation(mockOperation,args,{
        allowMissingRequired:typeof options.allowMissingRequired==='function'
          ? Boolean(options.allowMissingRequired(mockOperation,args))
          : Boolean(options.allowMissingRequired)
      });
      const selection={...(configuredResponses[mockOperation.operationId]||{}),...(args.response||{})};
      const base=resolveMockResponse(openapi,mockOperation,selection,args);
      const method=String(mockOperation.method||'GET').toUpperCase();

      if(method==='GET'||method==='HEAD')return applyMutations(mockOperation,args,base,mutations);

      mutations.push({operation:mockOperation,args:cloneValue(args),result:cloneValue(base)});
      return base;
    },
    reset(){mutations.length=0;},
    get(){throw new Error('MockClient generic get() requires an OpenAPI operation. Use <data-source request="operationId">.');},
    post(){throw new Error('MockClient generic post() requires an OpenAPI operation. Use data-operation="operationId" on an action element.');},
    put(){throw new Error('MockClient generic put() requires an OpenAPI operation. Use data-operation="operationId" on an action element.');},
    patch(){throw new Error('MockClient generic patch() requires an OpenAPI operation. Use data-operation="operationId" on an action element.');},
    delete(){throw new Error('MockClient generic delete() requires an OpenAPI operation. Use data-operation="operationId" on an action element.');}
  });
}

function applyMutations(readOperation,readArgs,base,mutations) {
  let value=cloneValue(base);
  for(const mutation of mutations) {
    const method=String(mutation.operation.method||'').toUpperCase();

    if(method==='POST' && sameCollection(readOperation,readArgs,mutation.operation,mutation.args)) {
      value=appendCollection(value,mergeObject(mutation.args.body,mutation.result));
      continue;
    }

    if(sameResource(readOperation,readArgs,mutation.operation,mutation.args)) {
      if(method==='DELETE')value=undefined;
      else if(method==='PUT'||method==='PATCH')value=mergeObject(value,mutation.args.body);
      continue;
    }

    const identity=childIdentity(readOperation,readArgs,mutation.operation,mutation.args);
    if(!identity)continue;
    if(method==='PUT'||method==='PATCH')value=updateCollection(value,identity,mutation.args.body);
    else if(method==='DELETE')value=removeFromCollection(value,identity);
  }
  return value;
}

function sameResource(readOperation,readArgs,mutationOperation,mutationArgs) {
  return readOperation.path===mutationOperation.path
    && pathArgsEqual(readOperation,readArgs?.path||{},mutationArgs?.path||{});
}

function sameCollection(readOperation,readArgs,mutationOperation,mutationArgs) {
  return readOperation.path===mutationOperation.path
    && pathArgsEqual(readOperation,readArgs?.path||{},mutationArgs?.path||{});
}

function childIdentity(readOperation,readArgs,mutationOperation,mutationArgs) {
  const prefix=String(readOperation.path||'').replace(/\/$/,'');
  const mutationPath=String(mutationOperation.path||'');
  if(!mutationPath.startsWith(prefix+'/'))return null;
  const remainder=mutationPath.slice(prefix.length+1);
  const match=/^\{([^}]+)\}$/.exec(remainder);
  if(!match)return null;
  if(!pathArgsEqual(readOperation,readArgs?.path||{},mutationArgs?.path||{}))return null;

  const key=match[1];
  const value=mutationArgs?.path?.[key];
  if(value===undefined||value===null)return null;
  const body=mutationArgs?.body;
  const candidateKeys=[];
  if(body&&typeof body==='object'&&!Array.isArray(body)){
    for(const [name,candidate] of Object.entries(body))if(sameScalar(candidate,value))candidateKeys.push(name);
  }
  if(!candidateKeys.includes(key))candidateKeys.push(key);
  if(!candidateKeys.includes('id'))candidateKeys.push('id');
  return {value,keys:candidateKeys};
}

function pathArgsEqual(operation,a,b) {
  for(const parameter of operation.parameters||[]){
    if(parameter.in!=='path')continue;
    if(!sameScalar(a?.[parameter.name],b?.[parameter.name]))return false;
  }
  return true;
}

function updateCollection(value,identity,patch) {
  const rows=collectionRows(value);
  if(!rows)return value;
  for(let index=0;index<rows.length;index+=1){
    if(matchesIdentity(rows[index],identity))rows[index]=mergeObject(rows[index],patch);
  }
  return value;
}

function removeFromCollection(value,identity) {
  const rows=collectionRows(value);
  if(!rows)return value;
  const next=rows.filter(row=>!matchesIdentity(row,identity));
  if(Array.isArray(value))return next;
  value.data=next;
  if(typeof value.total==='number')value.total=Math.max(0,value.total-(rows.length-next.length));
  return value;
}

function appendCollection(value,row) {
  if(!row||typeof row!=='object')return value;
  if(Array.isArray(value)){value.push(cloneValue(row));return value;}
  if(value&&Array.isArray(value.data)){
    value.data.push(cloneValue(row));
    if(typeof value.total==='number')value.total+=1;
  }
  return value;
}

function collectionRows(value) {
  if(Array.isArray(value))return value;
  if(value&&Array.isArray(value.data))return value.data;
  return null;
}

function matchesIdentity(row,identity) {
  if(!row||typeof row!=='object')return false;
  return identity.keys.some(key=>sameScalar(row[key],identity.value));
}

function mergeObject(base,patch) {
  if(!base||typeof base!=='object'||Array.isArray(base))return cloneValue(patch);
  if(!patch||typeof patch!=='object'||Array.isArray(patch))return cloneValue(base);
  return {...cloneValue(base),...cloneValue(patch)};
}

function sameScalar(a,b){return a!==undefined&&b!==undefined&&String(a)===String(b);}
function cloneValue(value){if(typeof structuredClone==='function')return structuredClone(value);return value===undefined?undefined:JSON.parse(JSON.stringify(value));}
