const METHODS=['get','put','post','delete','options','head','patch','trace'];
const SUPPORTED_SECURITY_TYPES=new Set(['apiKey','http','oauth2','openIdConnect','mutualTLS']);

export class OpenApiSupportError extends Error {
  constructor(diagnostics=[]) {
    const errors=(diagnostics||[]).filter(item=>item?.severity==='error');
    const details=errors.map(item=>`  - ${item.path||'/'} [${item.code}]: ${item.message}`).join('\n');
    super(`OpenAPI contract contains unsupported constructs:\n${details}\nRun "npx metaproject check" for the complete support diagnostics.`);
    this.name='OpenApiSupportError';
    this.diagnostics=errors;
  }
}

/** Return deterministic support-boundary diagnostics for the OpenAPI 0.11 subset. */
export function validateOpenApiSupport(openapi={}) {
  const diagnostics=[];
  if(!isObject(openapi)){
    return [diagnostic('error','unsupported-openapi-document','/','OpenAPI document must be an object.')];
  }

  const version=String(openapi.openapi||'');
  if(!/^3\.(?:0|1)\.\d+(?:[-+].*)?$/.test(version)){
    diagnostics.push(diagnostic('error','unsupported-openapi-version','/openapi',`OpenAPI version ${version||'(missing)'} is not supported; use OpenAPI 3.0.x or 3.1.x.`));
  }

  scanRefs(openapi,'',diagnostics);

  const schemeNames=new Set(Object.keys(openapi.components?.securitySchemes||{}));
  scanSecuritySchemes(openapi,diagnostics);
  scanSecurityRequirements(openapi.security,'/security',schemeNames,diagnostics);

  for(const [name,schema] of Object.entries(openapi.components?.schemas||{})){
    scanSchema(openapi,schema,pointer('components','schemas',name),diagnostics);
  }
  for(const [name,parameter] of Object.entries(openapi.components?.parameters||{})){
    scanParameter(openapi,parameter,pointer('components','parameters',name),diagnostics);
  }
  for(const [name,body] of Object.entries(openapi.components?.requestBodies||{})){
    scanRequestBody(openapi,body,pointer('components','requestBodies',name),diagnostics);
  }
  for(const [name,response] of Object.entries(openapi.components?.responses||{})){
    scanResponse(openapi,response,pointer('components','responses',name),diagnostics);
  }

  for(const [route,rawPathItem] of Object.entries(openapi.paths||{})){
    const pathBase=pointer('paths',route);
    const pathItem=resolveLocal(openapi,rawPathItem);
    if(!isObject(pathItem)) continue;

    if(Array.isArray(pathItem.servers)&&pathItem.servers.length){
      diagnostics.push(diagnostic('error','unsupported-scoped-servers',child(pathBase,'servers'),'Path-level servers are not supported; Core uses top-level servers.'));
    }

    for(let i=0;i<(pathItem.parameters||[]).length;i++){
      scanParameter(openapi,pathItem.parameters[i],child(child(pathBase,'parameters'),i),diagnostics);
    }

    for(const method of METHODS){
      const rawOperation=pathItem[method];
      if(!isObject(rawOperation)) continue;
      const operation=resolveLocal(openapi,rawOperation);
      if(!isObject(operation)) continue;
      const operationBase=child(pathBase,method);

      if(Array.isArray(operation.servers)&&operation.servers.length){
        diagnostics.push(diagnostic('error','unsupported-scoped-servers',child(operationBase,'servers'),'Operation-level servers are not supported; Core uses top-level servers.'));
      }
      if(isObject(operation.callbacks)&&Object.keys(operation.callbacks).length){
        diagnostics.push(diagnostic('error','unsupported-callbacks',child(operationBase,'callbacks'),'OpenAPI callbacks are not supported by Core.'));
      }

      for(let i=0;i<(operation.parameters||[]).length;i++){
        scanParameter(openapi,operation.parameters[i],child(child(operationBase,'parameters'),i),diagnostics);
      }
      if(operation.requestBody) scanRequestBody(openapi,operation.requestBody,child(operationBase,'requestBody'),diagnostics);
      for(const [status,response] of Object.entries(operation.responses||{})){
        scanResponse(openapi,response,child(child(operationBase,'responses'),status),diagnostics);
      }
      scanSecurityRequirements(operation.security,child(operationBase,'security'),schemeNames,diagnostics);
    }
  }

  return dedupeDiagnostics(diagnostics);
}

export function assertOpenApiSupport(openapi) {
  const diagnostics=validateOpenApiSupport(openapi);
  if(diagnostics.some(item=>item.severity==='error')) throw new OpenApiSupportError(diagnostics);
  return diagnostics;
}

function scanRefs(value,path,diagnostics){
  if(Array.isArray(value)){
    value.forEach((item,index)=>scanRefs(item,child(path,index),diagnostics));
    return;
  }
  if(!isObject(value)) return;
  if(typeof value.$ref==='string'){
    const target=value.$ref.split('#',1)[0];
    if(target&&/^(?:(?:https?:)?\/\/|[a-z][a-z0-9+.-]*:)/i.test(target)){
      diagnostics.push(diagnostic('error','unsupported-remote-ref',child(path,'$ref'),`Remote HTTP(S)/URI $ref is not supported: ${value.$ref}. Use a project-relative external file.`));
    }
  }
  for(const [key,item] of Object.entries(value)){
    if(key==='$ref') continue;
    scanRefs(item,child(path,key),diagnostics);
  }
}

function scanParameter(openapi,rawParameter,path,diagnostics){
  const parameter=resolveLocal(openapi,rawParameter);
  if(!isObject(parameter)) return;

  if(isObject(parameter.content)&&Object.keys(parameter.content).length){
    diagnostics.push(diagnostic('error','unsupported-parameter-content',child(path,'content'),'Parameters defined with content are not supported; use a parameter schema.'));
  }

  const schema=resolveLocal(openapi,parameter.schema);
  if(schema) scanSchema(openapi,schema,child(path,'schema'),diagnostics);

  const location=String(parameter.in||'');
  if(location==='cookie'){
    diagnostics.push(diagnostic('error','unsupported-cookie-parameter',path,`Cookie parameter ${parameter.name||'(unnamed)'} is not supported by the generated request runtime.`));
    return;
  }
  if(location&&!['path','query','header'].includes(location)){
    diagnostics.push(diagnostic('error','unsupported-parameter-location',child(path,'in'),`Parameter location ${location} is not supported.`));
    return;
  }

  const type=schemaType(schema);
  const style=parameter.style;
  const explode=parameter.explode;

  if(location==='query'&&style==='deepObject'){
    diagnostics.push(diagnostic('error','unsupported-deep-object',child(path,'style'),`deepObject serialization is not supported for query parameter ${parameter.name||'(unnamed)'}.`));
  }else{
    const expectedStyle=location==='query'?'form':location==='path'||location==='header'?'simple':null;
    if(style&&expectedStyle&&style!==expectedStyle){
      diagnostics.push(diagnostic('error','unsupported-parameter-style',child(path,'style'),`Parameter style ${style} is not supported for ${location} parameters; Core supports ${expectedStyle} serialization.`));
    }
  }

  if(type==='object'){
    diagnostics.push(diagnostic('error','unsupported-object-parameter',child(path,'schema'),'Object-valued path/query/header parameters are not serialized by Core.'));
  }
  if(type==='array'){
    if(location==='query'&&explode===false){
      diagnostics.push(diagnostic('error','unsupported-parameter-explode',child(path,'explode'),'Query arrays require form serialization with explode=true (the OpenAPI default).'));
    }
    if((location==='path'||location==='header')&&explode===true){
      diagnostics.push(diagnostic('error','unsupported-parameter-explode',child(path,'explode'),`${location} arrays require simple serialization with explode=false (the OpenAPI default).`));
    }
  }
}

function scanRequestBody(openapi,rawBody,path,diagnostics){
  const body=resolveLocal(openapi,rawBody);
  if(!isObject(body)) return;
  const entries=Object.entries(body.content||{});
  if(entries.length>1){
    diagnostics.push(diagnostic('warning','multiple-request-media-types',child(path,'content'),'Multiple request media types are only partially supported; Core prefers a JSON media type, otherwise the first declared type.'));
  }
  for(const [mediaType,rawMedia] of entries){
    const media=resolveLocal(openapi,rawMedia);
    const mediaPath=child(child(path,'content'),mediaType);
    const base=mediaBase(mediaType);
    if(base==='multipart/form-data'){
      diagnostics.push(diagnostic('error','unsupported-multipart-request',mediaPath,'multipart/form-data request bodies are not supported by contract-driven component operations.'));
    }else if(base==='application/x-www-form-urlencoded'){
      diagnostics.push(diagnostic('warning','partial-urlencoded-request',mediaPath,'application/x-www-form-urlencoded is supported for flat scalar object bodies; nested values and OpenAPI encoding rules are not interpreted.'));
    }else if(!/json/i.test(base)){
      diagnostics.push(diagnostic('warning','partial-request-media-type',mediaPath,`${mediaType} request bodies require a caller-supplied native/string body; object bodies are not encoded for this media type.`));
    }
    if(media?.schema) scanSchema(openapi,media.schema,child(mediaPath,'schema'),diagnostics);
  }
}

function scanResponse(openapi,rawResponse,path,diagnostics){
  const response=resolveLocal(openapi,rawResponse);
  if(!isObject(response)) return;
  if(isObject(response.links)&&Object.keys(response.links).length){
    diagnostics.push(diagnostic('error','unsupported-response-links',child(path,'links'),'OpenAPI response links are not supported by Core.'));
  }
  const entries=Object.entries(response.content||{});
  if(entries.length>1){
    diagnostics.push(diagnostic('warning','multiple-response-media-types',child(path,'content'),'Multiple response media types are only partially supported; schema/example tooling prefers application/json, otherwise the first declared type.'));
  }
  for(const [mediaType,rawMedia] of entries){
    const media=resolveLocal(openapi,rawMedia);
    if(media?.schema) scanSchema(openapi,media.schema,child(child(child(path,'content'),mediaType),'schema'),diagnostics);
  }
}

function scanSchema(openapi,rawSchema,path,diagnostics){
  const schema=resolveLocal(openapi,rawSchema);
  if(!isObject(schema)) return;
  for(const keyword of ['allOf','oneOf','anyOf']){
    if(Array.isArray(schema[keyword])&&schema[keyword].length){
      diagnostics.push(diagnostic('error',`unsupported-${keyword.replace('Of','-of').toLowerCase()}`,child(path,keyword),`${keyword} schema composition is not interpreted by Core's schema-driven components.`));
    }
  }
  if(schema.nullable===true||schema.type==='null'||(Array.isArray(schema.type)&&schema.type.includes('null'))){
    diagnostics.push(diagnostic('warning','partial-nullable-schema',path,'Nullable schemas are transported correctly, but Core does not normalize OpenAPI 3.0 nullable and OpenAPI 3.1 null-union semantics for schema-driven controls.'));
  }

  if(isObject(schema.properties)){
    for(const [name,childSchema] of Object.entries(schema.properties)) scanSchema(openapi,childSchema,child(child(path,'properties'),name),diagnostics);
  }
  if(schema.items) scanSchema(openapi,schema.items,child(path,'items'),diagnostics);
  if(isObject(schema.additionalProperties)) scanSchema(openapi,schema.additionalProperties,child(path,'additionalProperties'),diagnostics);
  for(const key of ['contains','not','if','then','else','propertyNames']){
    if(isObject(schema[key])) scanSchema(openapi,schema[key],child(path,key),diagnostics);
  }
  for(const key of ['prefixItems']){
    if(Array.isArray(schema[key])) schema[key].forEach((item,index)=>scanSchema(openapi,item,child(child(path,key),index),diagnostics));
  }
  for(const key of ['patternProperties','dependentSchemas']){
    if(isObject(schema[key])) for(const [name,item] of Object.entries(schema[key])) scanSchema(openapi,item,child(child(path,key),name),diagnostics);
  }
}

function scanSecuritySchemes(openapi,diagnostics){
  for(const [name,rawScheme] of Object.entries(openapi.components?.securitySchemes||{})){
    const path=pointer('components','securitySchemes',name);
    const scheme=resolveLocal(openapi,rawScheme);
    if(!isObject(scheme)) continue;
    const type=String(scheme.type||'');
    if(type&&!SUPPORTED_SECURITY_TYPES.has(type)){
      diagnostics.push(diagnostic('error','unsupported-security-scheme',child(path,'type'),`Security scheme type ${type} is not supported.`));
    }
    if(type==='apiKey'&&scheme.in==='cookie'){
      diagnostics.push(diagnostic('warning','browser-cookie-security',path,'Cookie API-key security is exposed as transport metadata, but browser fetch cannot set a Cookie header directly.'));
    }
    if(type==='mutualTLS'){
      diagnostics.push(diagnostic('warning','browser-mtls-security',path,'Mutual TLS is exposed as transport metadata and requires a host/custom transport; browser fetch cannot install a client certificate.'));
    }
  }
}

function scanSecurityRequirements(rawRequirements,path,schemeNames,diagnostics){
  if(!Array.isArray(rawRequirements)) return;
  rawRequirements.forEach((requirement,index)=>{
    if(!isObject(requirement)) return;
    for(const name of Object.keys(requirement)){
      if(!schemeNames.has(name)){
        diagnostics.push(diagnostic('error','unknown-security-scheme',child(child(path,index),name),`Security requirement references unknown scheme ${name}.`));
      }
    }
  });
}

function resolveLocal(document,value){
  let current=value;
  const seen=new Set();
  while(isObject(current)&&typeof current.$ref==='string'&&current.$ref.startsWith('#')){
    if(seen.has(current.$ref)) return current;
    seen.add(current.$ref);
    const target=resolvePointer(document,current.$ref.slice(1));
    if(target===undefined) return current;
    const siblings=Object.fromEntries(Object.entries(current).filter(([key])=>key!=='$ref'));
    current={...clone(target),...clone(siblings)};
  }
  return current;
}

function resolvePointer(document,pointerValue=''){
  const parts=String(pointerValue).replace(/^\//,'').split('/').filter(Boolean).map(part=>part.replace(/~1/g,'/').replace(/~0/g,'~'));
  let current=document;
  for(const part of parts) current=current?.[part];
  return current;
}

function schemaType(schema){
  if(!isObject(schema)) return '';
  if(Array.isArray(schema.type)) return schema.type.filter(type=>type!=='null')[0]||'null';
  if(schema.type) return schema.type;
  if(schema.properties) return 'object';
  return '';
}

function mediaBase(value){return String(value||'').split(';',1)[0].trim().toLowerCase();}
function isObject(value){return Boolean(value)&&typeof value==='object'&&!Array.isArray(value);}
function clone(value){return value===undefined?undefined:(typeof structuredClone==='function'?structuredClone(value):JSON.parse(JSON.stringify(value)));}
function pointer(...parts){return parts.reduce((path,part)=>child(path,part),'');}
function child(path,part){return `${path}/${String(part).replace(/~/g,'~0').replace(/\//g,'~1')}`;}
function diagnostic(severity,code,path,message){return{severity,code,path:path||'/',resource:'openapi.yaml',message};}
function dedupeDiagnostics(items){const seen=new Set();return items.filter(item=>{const key=`${item.severity}|${item.code}|${item.path}|${item.message}`;if(seen.has(key))return false;seen.add(key);return true;});}
