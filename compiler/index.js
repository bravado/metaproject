export const BASE_COMPONENT_CSS = `:host{display:block;box-sizing:border-box;max-width:100%;min-width:0}*,*::before,*::after{box-sizing:border-box;min-width:0}`;

const BUILTIN_TAGS=new Set(['data-source','data-table','data-form','data-label','form-input','form-textarea','form-select','form-checkbox','form-radio','component-property']);

export function parseComponentSource(source,{tag,path=''}={}){
  source=String(source??'');
  if(!tag)tag=tagFromComponentPath(path);
  validateComponentTag(tag);
  const removals=[];
  let title=humanizeTag(tag);
  const titleMatch=/<title\b[^>]*>([\s\S]*?)<\/title\s*>/i.exec(source);
  if(titleMatch){title=stripHtml(titleMatch[1]).trim()||title;removals.push([titleMatch.index,titleMatch.index+titleMatch[0].length]);}
  const properties=[];
  const propertyPattern=/<component-property\b([^>]*?)(?:\/>|>[\s\S]*?<\/component-property\s*>)/gi;
  let match;
  while((match=propertyPattern.exec(source))){
    const attrs=parseAttributes(match[1]);
    if(!attrs.name)continue;
    if(!/^[A-Za-z_$][\w$]*$/.test(attrs.name))throw new Error(`Invalid component property name ${attrs.name} in ${path||tag}.`);
    properties.push({name:attrs.name,type:attrs.type||'string',required:hasBoolean(attrs,'required'),context:hasBoolean(attrs,'context'),default:attrs.default!==undefined?parseLiteral(attrs.default):undefined,example:attrs.example!==undefined?parseLiteral(attrs.example):undefined,attribute:attrs.attribute});
    removals.push([match.index,match.index+match[0].length]);
  }
  const body=removeRanges(source,removals).trim();
  if(/<data-resource\b/i.test(body))throw new Error(`${path||tag}: <data-resource> was removed. Use <data-source request="operationId"> to fetch/provide data.`);
  if(/\bapi\.[A-Za-z_$][\w$]*\s*\(/.test(body))throw new Error(`${path||tag}: direct api.operationId() calls were removed. Use <data-source request="operationId">.`);
  if(/<data-source\b[^>]*\bsave\s*=/i.test(body))throw new Error(`${path||tag}: data-source save= was removed. Put data-operation="operationId" on the action element instead.`);
  assertStaticNativeTemplates(body,path||tag);
  const actions=unique([...body.matchAll(/\bdata-action\s*=\s*(['"])([^'"]+)\1/gi)].map(x=>x[2].trim()).filter(Boolean));
  const dependencies=unique([...body.matchAll(/<([a-z][\w.-]*-[\w.-]+)(?:\s|>|\/)/gi)].map(x=>x[1].toLowerCase()).filter(x=>x!==tag&&!BUILTIN_TAGS.has(x)));
  const analysis=analyzeComponentDependencies(body,tag);
  const actionOperations=analyzeActionOperations(body);
  return{tag,path,title,properties,contextProperty:properties.find(p=>p.context)?.name||null,actions,actionOperations,dependencies,body,...analysis};
}

export function assertStaticNativeTemplates(source,resource='component'){
  const pattern=/<template\b([^>]*)>([\s\S]*?)<\/template\s*>/gi;let match;
  while((match=pattern.exec(String(source||'')))){const body=match[2]||'';if(!body.includes('${'))continue;const attrs=parseAttributes(match[1]||'');const kind=attrs['data-row']!==undefined?'<template data-row>':'<template>';throw new Error(`${resource}: Lit expressions are not allowed inside ${kind}. Move dynamic handlers/bindings to the owning component and use row context plus data-action/data-label/form-* inside the template.`);}
}

export function analyzeActionOperations(source){
  return dataOperationIds(source).map(operationId=>({event:'click',operationId}));
}

export function analyzeComponentDependencies(source,sourceTag){
  const relationships=[];const diagnostics=[];
  for(const attrs of dataSourceAttributes(source)){
    if(typeof attrs.request==='string'&&attrs.request&&!attrs.request.includes('${'))relationships.push({type:'calls',source:sourceTag,targetKind:'operationId',target:attrs.request,origin:'component-source'});
  }
  for(const operationId of dataOperationIds(source))relationships.push({type:'calls',source:sourceTag,targetKind:'operationId',target:operationId,origin:'component-source'});
  let match;const navPattern=/\bnavigate\s*\(\s*(['"])([^'"\n]+)\1/g;
  while((match=navPattern.exec(source)))relationships.push({type:'navigates-to',source:sourceTag,targetKind:'componentTag',target:match[2],origin:'component-source'});
  if(/<data-source\b[^>]*request\s*=\s*\$\{/i.test(source))diagnostics.push({severity:'warning',code:'dynamic-operation',resource:sourceTag,message:'Dynamic data-source request operation cannot be represented on the graph.'});
  if(/\bdata-operation\s*=\s*\$\{/i.test(source))diagnostics.push({severity:'warning',code:'dynamic-operation',resource:sourceTag,message:'Dynamic data-operation cannot be represented on the graph.'});
  if(/\bnavigate\s*\(\s*(?!['"])/.test(source))diagnostics.push({severity:'warning',code:'dynamic-navigation',resource:sourceTag,message:'Dynamic navigate(...) target cannot be represented on the graph.'});
  return{relationships:dedupeRelationships(relationships),diagnostics};
}

export function splitLitTemplate(source){const strings=[],expressions=[];let start=0,i=0;while(i<source.length){if(source[i]==='$'&&source[i+1]==='{'){strings.push(source.slice(start,i));const expressionStart=i+2;const end=findExpressionEnd(source,expressionStart);if(end<0)throw new Error(`Unterminated Lit expression at offset ${i}`);expressions.push(source.slice(expressionStart,end));i=end+1;start=i;continue;}i+=1;}strings.push(source.slice(start));return{strings,expressions};}

export function compileComponentModule({tag,path='',source,css='',scriptImport=null,scriptSource=''}){
  const definition=parseComponentSource(source,{tag,path});
  const template=splitLitTemplate(definition.body);
  const helperNames=extractNamedExports(scriptSource);
  const context=definition.contextProperty;
  const className=classNameForTag(tag);
  const propertiesSource=`{${definition.properties.map(prop=>`${JSON.stringify(prop.name)}: ${litPropertySource(prop)}`).join(', ')}}`;
  const defaults=definition.properties.filter(prop=>prop.default!==undefined).map(prop=>`    this.${prop.name} = ${serializeJs(prop.default)};`).join('\n');
  const propertyNames=definition.properties.map(x=>x.name);
  const destructureProperties=propertyNames.length?`const { ${propertyNames.join(', ')} } = this;`:'';
  const destructureHelpers=helperNames.length?`const { ${helperNames.join(', ')} } = __helpers;`:'';
  const values=template.expressions.map(expr=>`(${expr})`).join(',\n      ');
  const scriptImportLine=scriptImport?`import * as __helpers from ${JSON.stringify(scriptImport)};`:'const __helpers = Object.freeze({});';
  const contextCtor=context?`this.__resourceContext = new ResourceContextController(this, () => this.${context});`:'';
  const contextLifecycle=context?`connectedCallback() { super.connectedCallback(); queueMicrotask(() => { if (this.${context} === undefined) this.__contextSubscription = requestResourceContext(this, value => { if (this.${context} === undefined) this.${context} = value; }, { subscribe:true }); }); }\n  disconnectedCallback() { this.__contextSubscription?.(); super.disconnectedCallback(); }\n  updated(changed) { if (changed.has(${JSON.stringify(context)})) this.__resourceContext.resourceChanged(); }`:'';
  const styles=`static styles = unsafeCSS(${JSON.stringify(BASE_COMPONENT_CSS+'\n'+(css||''))});`;
  return `import { LitElement, html, nothing, unsafeCSS } from 'lit';\nimport { ResourceContextController, requestResourceContext, metaprojectEnvironment } from 'metaproject/components';\n${scriptImportLine}\n\nexport const metaprojectComponent = ${JSON.stringify({tag,title:definition.title,properties:definition.properties,actions:definition.actions,actionOperations:definition.actionOperations})};\n\nexport class ${className} extends LitElement {\n  static properties = ${propertiesSource};\n  ${styles}\n\n  constructor() {\n    super();\n${defaults||'    // No declared defaults.'}\n    ${contextCtor}\n  }\n\n  ${contextLifecycle}\n\n  render() {\n    const { navigate } = metaprojectEnvironment();\n    ${destructureProperties}\n    ${destructureHelpers}\n    const __strings = ${JSON.stringify(template.strings)};\n    __strings.raw = [...__strings];\n    return html(__strings${values?`,\n      ${values}`:''});\n  }\n}\n\nif (!customElements.get(${JSON.stringify(tag)})) customElements.define(${JSON.stringify(tag)}, ${className});\n`;
}

export function designTimeProperties(definition){const result={};for(const property of definition.properties||[]){if(property.example!==undefined)result[property.name]=structuredCloneSafe(property.example);else if(property.default!==undefined)result[property.name]=structuredCloneSafe(property.default);}return result;}
export function extractNamedExports(source=''){const names=[];let match;const patterns=[/\bexport\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g,/\bexport\s+class\s+([A-Za-z_$][\w$]*)/g,/\bexport\s+(?:const|let|var)\s+([A-Za-z_$][\w$]*)/g];for(const pattern of patterns)while((match=pattern.exec(source)))names.push(match[1]);return unique(names);}
export function tagFromComponentPath(path){const parts=String(path).replace(/\\/g,'/').split('/').filter(Boolean);const componentIndex=parts.lastIndexOf('components');if(componentIndex>=0&&parts[componentIndex+1]){const tail=parts.slice(componentIndex+1);if(tail.at(-1)==='component.html')tail.pop();if(tail.length)return tail.at(-1).replace(/\.(?:js|ts|html)$/i,'');}const base=parts.at(-1)||'';return base.replace(/\.(?:js|ts|html)$/i,'');}
export function humanizeTag(tag){return String(tag).split('-').filter(Boolean).map(word=>word[0]?.toUpperCase()+word.slice(1)).join(' ');}
export function validateComponentTag(tag){if(!tag||!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)+$/.test(tag))throw new Error(`Component tag ${JSON.stringify(tag)} must be a valid custom-element name containing a hyphen.`);}

function dataSourceAttributes(source){const values=[];for(const match of String(source||'').matchAll(/<data-source\b([^>]*)>/gi))values.push(parseAttributes(match[1]||''));return values;}
function dataOperationIds(source){return unique([...String(source||'').matchAll(/\bdata-operation\s*=\s*(['"])([^'"]+)\1/gi)].map(match=>match[2].trim()).filter(Boolean));}
function litPropertySource(prop){if(prop.attribute==='false'||!['string','boolean','number','integer'].includes(String(prop.type).toLowerCase()))return`{ attribute:false }`;const type=String(prop.type).toLowerCase();if(type==='boolean')return`{ type:Boolean }`;if(type==='number'||type==='integer')return`{ type:Number }`;return`{ type:String }`;}
function classNameForTag(tag){return tag.split('-').map(x=>x[0].toUpperCase()+x.slice(1)).join('')+'Element';}
function parseAttributes(source){const attrs={};const pattern=/([:@.A-Za-z_][\w:.-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;let match;while((match=pattern.exec(source)))attrs[match[1]]=match[2]??match[3]??match[4]??true;return attrs;}
function hasBoolean(attrs,key){return attrs[key]===true||attrs[key]===''||attrs[key]===key||attrs[key]==='true';}
function parseLiteral(value){if(typeof value!=='string')return value;const trimmed=value.trim();if(trimmed==='true')return true;if(trimmed==='false')return false;if(trimmed==='null')return null;if(/^-?\d+(?:\.\d+)?$/.test(trimmed))return Number(trimmed);try{if(/^[\[{]/.test(trimmed))return JSON.parse(trimmed);}catch{}return value;}
function serializeJs(value){return JSON.stringify(value);}
function stripHtml(value){return String(value).replace(/<[^>]*>/g,'');}
function removeRanges(source,ranges){return[...ranges].sort((a,b)=>b[0]-a[0]).reduce((text,[start,end])=>text.slice(0,start)+text.slice(end),source);}
function unique(items){return[...new Set(items)];}
function dedupeRelationships(items){const seen=new Set();return items.filter(item=>{const key=`${item.type}|${item.source}|${item.targetKind}|${item.target}`;if(seen.has(key))return false;seen.add(key);return true;});}
function structuredCloneSafe(value){return typeof structuredClone==='function'?structuredClone(value):JSON.parse(JSON.stringify(value));}
function findExpressionEnd(source,start){let depth=1;for(let i=start;i<source.length;i++){const ch=source[i],next=source[i+1];if(ch==="'"||ch==='"'){i=skipQuotedString(source,i,ch);if(i<0)return-1;continue;}if(ch==='`'){i=skipTemplateLiteral(source,i);if(i<0)return-1;continue;}if(ch==='/'&&next==='/'){const nl=source.indexOf('\n',i+2);if(nl<0)return source.length-1;i=nl;continue;}if(ch==='/'&&next==='*'){const close=source.indexOf('*/',i+2);if(close<0)return-1;i=close+1;continue;}if(ch==='{')depth+=1;else if(ch==='}'){depth-=1;if(depth===0)return i;}}return-1;}
function skipQuotedString(source,start,quote){for(let i=start+1;i<source.length;i++){if(source[i]==='\\'){i+=1;continue;}if(source[i]===quote)return i;}return-1;}
function skipTemplateLiteral(source,start){for(let i=start+1;i<source.length;i++){if(source[i]==='\\'){i+=1;continue;}if(source[i]==='`')return i;if(source[i]==='$'&&source[i+1]==='{'){const end=findExpressionEnd(source,i+2);if(end<0)return-1;i=end;}}return-1;}
