const METHODS = ['get','put','post','delete','options','head','patch','trace'];

/**
 * Build the framework-agnostic Metaproject resource index for an OpenAPI document.
 * Canvas, CLI validation, and other development tools should consume this instead
 * of maintaining their own OpenAPI graph/index implementation.
 */
export function buildOpenApiIndex(document) {
  const operations = [];
  const schemas = [];
  const relationships = [];
  const diagnostics = [];
  const opIds = new Set();
  const projectIds = new Set();

  for (const [operationPath, item] of Object.entries(document?.paths || {})) {
    if (!item || typeof item !== 'object') continue;
    for (const method of METHODS) {
      const operation = item[method];
      if (!operation || typeof operation !== 'object') continue;
      const operationId = operation.operationId || `${method}_${slug(operationPath)}`;
      const projectId = operation['x-project-id'] || `missing:operation:${method}:${operationPath}`;
      operations.push({
        kind:'operation',
        id:projectId,
        operationId,
        method:method.toUpperCase(),
        path:operationPath,
        summary:operation.summary || '',
        description:operation.description || '',
        raw:operation,
        sourceRef:operation['x-source-ref'] || item['x-source-ref'] || null
      });
      if (!operation.operationId) diagnostics.push({severity:'error',code:'missing-operation-id',resource:projectId,message:`${method.toUpperCase()} ${operationPath} is missing operationId.`});
      if (!operation['x-project-id']) diagnostics.push({severity:'error',code:'missing-project-id',resource:projectId,message:`${method.toUpperCase()} ${operationPath} is missing x-project-id.`});
      if (opIds.has(operationId)) diagnostics.push({severity:'error',code:'duplicate-operation-id',resource:projectId,message:`Duplicate operationId: ${operationId}`});
      opIds.add(operationId);
      trackProjectId(projectId,projectIds,diagnostics);
      for (const target of collectOperationSchemas(operation)) relationships.push({type:'uses',source:projectId,targetKind:'schemaName',target,origin:'openapi'});
    }
  }

  for (const [name, schema] of Object.entries(document?.components?.schemas || {})) {
    if (!schema || typeof schema !== 'object') continue;
    const projectId = schema['x-project-id'] || `missing:schema:${name}`;
    schemas.push({kind:'schema',id:projectId,name,schema,sourceRef:schema['x-source-ref'] || null});
    if (!schema['x-project-id']) diagnostics.push({severity:'error',code:'missing-project-id',resource:projectId,message:`Schema ${name} is missing x-project-id.`});
    trackProjectId(projectId,projectIds,diagnostics);
    for (const target of collectRefs(schema)) relationships.push({type:'references',source:projectId,targetKind:'schemaName',target,origin:'openapi'});
  }

  return {operations,schemas,relationships:dedupe(relationships),diagnostics};
}

export function collectOperationSchemas(operation) {
  const names = new Set();
  for (const parameter of operation?.parameters || []) collectRefsInto(parameter?.schema,names);
  if (operation?.requestBody) collectRefsInto(operation.requestBody,names);
  for (const response of Object.values(operation?.responses || {})) collectRefsInto(response,names);
  return [...names];
}

export function collectRefs(value) {
  const names = new Set();
  collectRefsInto(value,names);
  return [...names];
}

function collectRefsInto(value,set) {
  if (!value || typeof value !== 'object') return;
  if (typeof value.$ref === 'string') {
    const match=value.$ref.match(/#\/components\/schemas\/([^/]+)$/);
    if (match) set.add(decodeURIComponent(match[1]));
  }
  for (const child of Array.isArray(value) ? value : Object.values(value)) collectRefsInto(child,set);
}

function trackProjectId(id,set,diagnostics) {
  if (id.startsWith('missing:')) return;
  if (set.has(id)) diagnostics.push({severity:'error',code:'duplicate-project-id',resource:id,message:`Duplicate x-project-id: ${id}`});
  set.add(id);
}
function slug(value){return String(value||'').replace(/[^a-zA-Z0-9]+/g,'_').replace(/^_|_$/g,'')||'root';}
function dedupe(items){const seen=new Set();return items.filter(item=>{const key=`${item.type}|${item.source}|${item.targetKind}|${item.target}`;if(seen.has(key))return false;seen.add(key);return true;});}
