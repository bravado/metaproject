import { buildOpenApiIndex } from '../openapi/indexer.js';
import {
  parseComponentSource,
  analyzeComponentDependencies,
  tagFromComponentPath,
  humanizeTag
} from '../compiler/index.js';

const BUILTIN_COMPONENT_TAGS = new Set(['data-source','data-table','data-form','data-label','form-input','form-textarea','form-select','form-checkbox','form-radio']);
const HTML_STANDARD_TAGS = new Set([
  'a','abbr','address','article','aside','audio','b','blockquote','body','br','button','canvas','caption','code','col','colgroup','data','dd','details','dialog','div','dl','dt','em','fieldset','figcaption','figure','footer','form','h1','h2','h3','h4','h5','h6','head','header','hr','html','i','iframe','img','input','label','legend','li','link','main','menu','meta','nav','ol','optgroup','option','p','picture','pre','progress','section','select','slot','small','source','span','strong','style','summary','table','tbody','td','template','textarea','tfoot','th','thead','time','title','tr','track','ul','video'
]);

/**
 * Build the canonical Metaproject resource/relationship index from project files
 * and OpenAPI. This is deliberately UI-agnostic so Canvas and other tooling can
 * share the same diagnostics and dependency model.
 */
export function buildProjectIndex({ files, openapi, project = {}, componentSource } = {}) {
  files ||= {};
  const apiIndex = buildOpenApiIndex(openapi);
  const components = [];
  const views = [];
  const diagnostics = [...apiIndex.diagnostics];
  const rawRelationships = [...apiIndex.relationships];
  const sourceRoot = normalizeProjectPath(componentSource || project?.components?.source || 'components');
  const sourcePrefix = sourceRoot ? `${sourceRoot}/` : '';
  const componentHtmlPaths = new Set(Object.keys(files).filter(file => {
    const normalized=normalizeProjectPath(file);
    return normalized.startsWith(sourcePrefix) && normalized.endsWith('/component.html');
  }));

  for (const file of [...componentHtmlPaths].sort()) {
    const tag = tagFromComponentPath(file);
    try {
      const definition = parseComponentSource(String(files[file]), { tag, path:file });
      const directory = file.slice(0,-'component.html'.length);
      const stylePath = `${directory}style.css`;
      const jsPath = `${directory}component.js`;
      const tsPath = `${directory}component.ts`;
      const scriptPath = files[jsPath] != null ? jsPath : files[tsPath] != null ? tsPath : null;
      const scriptSource = scriptPath ? String(files[scriptPath]) : '';
      const scriptAnalysis = scriptSource ? analyzeComponentDependencies(scriptSource,tag) : {relationships:[],diagnostics:[]};
      const advancedDependencies = customElementTags(scriptSource).filter(value => !BUILTIN_COMPONENT_TAGS.has(value));
      const dependencies = unique([...definition.dependencies,...advancedDependencies]);
      components.push({
        kind:'component', id:tag, tag, name:definition.title, title:definition.title, path:file,
        directory:directory.replace(/\/$/,''), source:String(files[file]), css:String(files[stylePath] || ''),
        script:scriptSource, scriptPath,
        properties:definition.properties, contextProperty:definition.contextProperty,
        actions:definition.actions, dependencies, definition
      });
      diagnostics.push(
        ...withDiagnosticSource(definition.diagnostics,file,'html'),
        ...withDiagnosticSource(scriptAnalysis.diagnostics,scriptPath,'js')
      );
      rawRelationships.push(
        ...withRelationshipSource(definition.relationships,file,'html'),
        ...withRelationshipSource(scriptAnalysis.relationships,scriptPath,'js')
      );
      for (const dependency of dependencies) rawRelationships.push({type:'uses',source:tag,targetKind:'componentTag',target:dependency,origin:'component-source'});
    } catch (error) {
      diagnostics.push({severity:'error',code:'component-parse',resource:file,sourcePath:file,editorTab:'html',message:error.message});
    }
  }

  // Advanced single-file Web Components remain an escape hatch.
  for (const [rawPath, content] of Object.entries(files)) {
    const file=normalizeProjectPath(rawPath);
    if (!file.startsWith(sourcePrefix) || !/\.(?:js|ts)$/.test(file)) continue;
    if (/\/component\.(?:js|ts)$/.test(file)) continue;
    const source = String(content);
    const tag = componentTag(source);
    if (!tag) {
      diagnostics.push({severity:'warning',code:'component-tag-missing',resource:file,sourcePath:file,editorTab:'source',message:`Could not infer a custom element tag from ${file}.`});
      continue;
    }
    const analysis = analyzeComponentDependencies(source,tag);
    components.push({kind:'component',id:tag,tag,name:humanizeTag(tag),title:humanizeTag(tag),path:file,source,css:'',script:source,scriptPath:file,properties:[],contextProperty:null,actions:[],dependencies:customElementTags(source),advanced:true});
    diagnostics.push(...withDiagnosticSource(analysis.diagnostics,file,'source'));
    rawRelationships.push(...withRelationshipSource(analysis.relationships,file,'source'));
    for (const dependency of customElementTags(source)) rawRelationships.push({type:'uses',source:tag,targetKind:'componentTag',target:dependency,origin:'component-source'});
  }

  // Canvas metadata is optional. Core indexes it when present but never requires it.
  if (project?.canvas != null && !Array.isArray(project.canvas)) {
    diagnostics.push({severity:'error',code:'invalid-canvas-list',resource:'metaproject.yaml',message:'metaproject.canvas must be a list.'});
  }
  const canvasIds = new Set();
  for (const [position, canvas] of (Array.isArray(project?.canvas) ? project.canvas : []).entries()) {
    if (!canvas || typeof canvas !== 'object' || Array.isArray(canvas)) {
      diagnostics.push({severity:'error',code:'invalid-canvas',resource:'metaproject.yaml',message:`canvas[${position}] must be a mapping.`});
      continue;
    }
    const id = String(canvas.id || '').trim();
    if (!id) {
      diagnostics.push({severity:'error',code:'missing-canvas-id',resource:'metaproject.yaml',message:`canvas[${position}] is missing id.`});
      continue;
    }
    if (canvasIds.has(id)) diagnostics.push({severity:'error',code:'duplicate-canvas-id',resource:'metaproject.yaml',message:`Duplicate canvas id: ${id}`});
    canvasIds.add(id);
    views.push({kind:'view',id,path:id,canvasId:id,title:String(canvas.name || humanizeCanvasId(id)),canvas});
  }

  const componentByTag = new Map();
  for (const component of components) {
    const editorTab = component.advanced ? 'source' : 'html';
    if (BUILTIN_COMPONENT_TAGS.has(component.tag)) diagnostics.push({severity:'error',code:'reserved-component-tag',resource:component.id,sourcePath:component.path,editorTab,message:`${component.tag} is a Metaproject base component and cannot be redefined.`});
    if (componentByTag.has(component.tag)) diagnostics.push({severity:'error',code:'duplicate-component-tag',resource:component.id,sourcePath:component.path,editorTab,message:`Component <${component.tag}> is defined more than once.`});
    else componentByTag.set(component.tag,component);
  }

  const opByOperationId = new Map(apiIndex.operations.map(value => [value.operationId,value]));
  const entityByName = new Map(apiIndex.entities.map(value => [value.name,value]));
  const relationships = [];
  for (const relation of rawRelationships) {
    let target = relation.target;
    if (relation.targetKind === 'operationId') {
      const resource = opByOperationId.get(relation.target);
      if (!resource) { diagnostics.push({severity:'error',code:'unknown-operation',resource:relation.source,sourcePath:relation.sourcePath,editorTab:relation.editorTab,message:`Unknown operation ${relation.target}.`}); continue; }
      target = resource.id;
    } else if (relation.targetKind === 'entityName') {
      const resource = entityByName.get(relation.target);
      if (!resource) { diagnostics.push({severity:'error',code:'unknown-entity',resource:relation.source,sourcePath:relation.sourcePath,editorTab:relation.editorTab,message:`Unknown Entity ${relation.target}.`}); continue; }
      target = resource.id;
    } else if (relation.targetKind === 'componentTag') {
      const resource = componentByTag.get(relation.target);
      if (!resource) {
        if (relation.type === 'navigates-to') diagnostics.push({severity:'error',code:'unknown-component',resource:relation.source,sourcePath:relation.sourcePath,editorTab:relation.editorTab,message:`Unknown navigation component <${relation.target}>.`});
        continue;
      }
      target = resource.id;
    }
    relationships.push({...relation,target});
  }

  return {
    components,
    operations:apiIndex.operations,
    entities:apiIndex.entities,
    views,
    resources:[...components,...apiIndex.operations,...apiIndex.entities],
    relationships:dedupe(relationships),
    diagnostics
  };
}

export function relatedRelationships(index, resourceIds) {
  const set = new Set(resourceIds);
  return (index?.relationships || []).filter(relation => set.has(relation.source) && set.has(relation.target));
}

export function componentTag(source) {
  const decorator=String(source||'').match(/@customElement\(\s*['"]([^'"]+)['"]\s*\)/);
  if (decorator) return decorator[1];
  return String(source||'').match(/customElements\.define\(\s*['"]([^'"]+)['"]/)?.[1] || null;
}

function customElementTags(source) {
  const tags=[];
  for (const match of String(source||'').matchAll(/<([a-z][\w.-]*-[\w.-]+)(?:\s|>|\/)/g)) if (!HTML_STANDARD_TAGS.has(match[1])) tags.push(match[1]);
  return unique(tags);
}
function normalizeProjectPath(value){return String(value||'').replace(/\\/g,'/').replace(/^\.\//,'').replace(/\/$/,'');}
function unique(items){return [...new Set(items)];}
function withDiagnosticSource(items,sourcePath,editorTab){return (items||[]).map(item=>({...item,sourcePath,editorTab}));}
function withRelationshipSource(items,sourcePath,editorTab){return (items||[]).map(item=>({...item,sourcePath,editorTab}));}
function dedupe(items){const seen=new Set();return items.filter(item=>{const key=`${item.type}|${item.source}|${item.target}`;if(seen.has(key))return false;seen.add(key);return true;});}
function humanizeCanvasId(id){return String(id||'canvas').replace(/[-_]+/g,' ').replace(/\b\w/g,match=>match.toUpperCase());}
