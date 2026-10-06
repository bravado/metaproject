import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { parse as parseYaml } from 'yaml';
import { generateApiModule, collectApiOperations } from '../operations/index.js';
import { resolveOpenApiRefs, assertOpenApiExamples, collectOpenApiServers, resolveOpenApiServerUrl, validateOpenApiSupport, OpenApiSupportError } from '../openapi/index.js';
import { compileComponentModule, parseComponentSource, tagFromComponentPath } from '../compiler/index.js';
import { parseMetaprojectConfig } from '../project/config.js';

export const DEFAULT_COMPONENT_SOURCE='components';
export const DEFAULT_COMPONENT_OUTPUT='public/components';
export const DEFAULT_OPENAPI_PATH='openapi.yaml';
export const RUNTIME_ABI_VERSION=1;
export const RUNTIME_ABI_SYMBOL=`metaproject.runtime.v${RUNTIME_ABI_VERSION}`;
export const MANIFEST_SCHEMA_VERSION=2;
export const BUILD_VERSION=JSON.parse(fs.readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..','package.json'),'utf8')).version;

export async function buildProject({root=process.cwd(),minify,sourcemap}={}){
  root=path.resolve(root);const project=loadProjectBuildContext(root);assertOpenApiExamples(project.resolvedOpenApi);await loadEsbuild();
  const outputAbsolute=safeProjectPath(root,project.outputDir);fs.rmSync(outputAbsolute,{recursive:true,force:true});fs.mkdirSync(outputAbsolute,{recursive:true});
  const api=buildProjectApiModule({root,context:project});
  const components=await buildProjectComponents({root,context:project,minify:minify??project.config.build?.minify??false,sourcemap:sourcemap??project.config.build?.sourcemap??false});
  return{root,config:project.config,outputDir:project.outputDir,api,components};
}

export function buildProjectApiModule({root=process.cwd(),outputPath,context}={}){
  root=path.resolve(root);const project=context||loadProjectBuildContext(root);const targetRelative=normalizeProjectPath(outputPath||project.config.components?.output_api||`${project.outputDir}/api.js`);const targetAbsolute=safeProjectPath(root,targetRelative);const source=generateApiModule({openapi:project.resolvedOpenApi,apiRoot:project.apiRoot});fs.mkdirSync(path.dirname(targetAbsolute),{recursive:true});fs.writeFileSync(targetAbsolute,source);return{root,config:project.config,apiRoot:project.apiRoot,openapiPath:project.openapiPath,outputPath:targetRelative,operations:collectApiOperations(project.resolvedOpenApi),source};
}

export async function buildProjectComponents({root=process.cwd(),context,minify=false,sourcemap=false}={}){
  root=path.resolve(root);
  const project=context||loadProjectBuildContext(root);
  const components=discoverProjectComponents(root,project.componentSourceDir);
  const outputAbsolute=safeProjectPath(root,project.outputDir);
  fs.mkdirSync(outputAbsolute,{recursive:true});
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'metaproject-build-'));
  const scope=project.scope;
  const operations=Object.fromEntries(collectApiOperations(project.resolvedOpenApi).map(operation=>[operation.operationId,operation]));
  const esbuild=await loadEsbuild();
  const buildOptions={bundle:true,splitting:false,format:'esm',platform:'browser',target:['es2022'],minify:Boolean(minify),sourcemap:Boolean(sourcemap),logLevel:'silent'};
  try{
    const manifest={version:MANIFEST_SCHEMA_VERSION,generatedBy:'metaproject',generatedByVersion:BUILD_VERSION,scope,apiRoot:project.apiRoot,openapi:project.openapiPath,runtime:'index.js',runtimeAbi:RUNTIME_ABI_VERSION,runtimeSymbol:RUNTIME_ABI_SYMBOL,components:{}};
    const runtimeEntry=path.join(temp,'runtime-entry.js');
    fs.writeFileSync(runtimeEntry,runtimeEntrySource({scope,apiRoot:project.apiRoot,operations}));
    await esbuild.build({...buildOptions,entryPoints:[runtimeEntry],outfile:path.join(outputAbsolute,'index.js'),plugins:[runtimeResolver()]});
    fs.writeFileSync(path.join(outputAbsolute,'runtime.js'),"export * from './index.js';\n");
    fs.writeFileSync(path.join(outputAbsolute,'api.js'),generateApiModule({openapi:project.resolvedOpenApi,apiRoot:project.apiRoot}));

    // Compile every component before bundling so dependencies can be included
    // in each individually distributable file. No sibling JS files are required.
    for(const component of components.values()){
      const source=fs.readFileSync(component.htmlPath,'utf8');
      const css=component.stylePath?fs.readFileSync(component.stylePath,'utf8'):'';
      const scriptSource=component.scriptPath?fs.readFileSync(component.scriptPath,'utf8'):'';
      const definition=parseComponentSource(source,{tag:component.tag,path:component.relativeHtmlPath});
      const dependencyImports=definition.dependencies.filter(dependency=>components.has(dependency)).map(dependency=>"import './"+dependency+".js';").join('\n');
      const scriptImport=component.scriptPath?'metaproject-helper:'+component.tag:null;
      const compiled=compileComponentModule({tag:component.tag,path:component.relativeHtmlPath,source,css,scriptImport,scriptSource,scope});
      const registration="import { registerMetaprojectScope, registerMetaprojectTag } from 'metaproject/components';\n"+
        "registerMetaprojectScope("+JSON.stringify({scope,operations,apiRoot:project.apiRoot})+");\n"+
        "registerMetaprojectTag("+JSON.stringify(component.tag)+","+JSON.stringify(scope)+");\n";
      fs.writeFileSync(path.join(temp,component.tag+'.js'),dependencyImports+(dependencyImports?'\n':'')+registration+compiled);
      manifest.components[component.tag]={file:component.tag+'.js',standalone:true,scope,runtimeAbi:RUNTIME_ABI_VERSION,title:definition.title,properties:definition.properties,actions:definition.actions,actionOperations:definition.actionOperations,dependencies:definition.dependencies};
    }
    for(const tag of components.keys()){
      await esbuild.build({...buildOptions,entryPoints:[path.join(temp,tag+'.js')],outfile:path.join(outputAbsolute,tag+'.js'),plugins:[componentResolver(components)]});
    }
    const tags=[...components.keys()].sort();
    fs.writeFileSync(path.join(outputAbsolute,'all.js'),"import './index.js';\n"+tags.map(tag=>"import './"+tag+".js';").join('\n')+'\n');
    fs.writeFileSync(path.join(outputAbsolute,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
    assertBrowserNativeOutput(outputAbsolute);
    const files=walk(outputAbsolute).map(file=>normalizeProjectPath(path.relative(root,file))).sort();
    return{sourceDir:project.componentSourceDir,outputDir:project.outputDir,count:components.size,tags,manifest,files};
  }finally{fs.rmSync(temp,{recursive:true,force:true});}
}

export function discoverProjectComponents(root,sourceDir=DEFAULT_COMPONENT_SOURCE){root=path.resolve(root);const sourceAbsolute=safeProjectPath(root,sourceDir);const out=new Map();if(!fs.existsSync(sourceAbsolute))return out;for(const htmlPath of walk(sourceAbsolute).filter(file=>path.basename(file)==='component.html')){const tag=tagFromComponentPath(htmlPath);if(out.has(tag))throw new Error(`Duplicate Metaproject component tag <${tag}>.`);const dir=path.dirname(htmlPath);const scriptPath=['component.ts','component.js'].map(name=>path.join(dir,name)).find(file=>fs.existsSync(file))||null;const stylePath=path.join(dir,'style.css');out.set(tag,{tag,htmlPath,relativeHtmlPath:normalizeProjectPath(path.relative(root,htmlPath)),scriptPath,stylePath:fs.existsSync(stylePath)?stylePath:null});}return out;}

export function loadProjectBuildContext(root=process.cwd(),{allowUnsupported=false}={}){
  root=path.resolve(root);
  const configPath=path.join(root,'metaproject.yaml');
  if(!fs.existsSync(configPath))throw new Error(`Metaproject project not found: ${configPath}. Run "npx metaproject init" first.`);
  const config=parseMetaprojectConfig(fs.readFileSync(configPath,'utf8'),{filePath:'metaproject.yaml'});
  const openapiPath=normalizeProjectPath(config.openapi||DEFAULT_OPENAPI_PATH);
  const openapiAbsolute=safeProjectPath(root,openapiPath);
  if(!fs.existsSync(openapiAbsolute))throw new Error(`OpenAPI file not found: ${openapiPath}. Run "npx metaproject init" first.`);
  const openapi=parseDocument(fs.readFileSync(openapiAbsolute,'utf8'),openapiPath)||{};
  const rawSupportDiagnostics=validateOpenApiSupport(openapi);
  const remoteRefErrors=rawSupportDiagnostics.filter(item=>item.severity==='error'&&item.code==='unsupported-remote-ref');
  if(remoteRefErrors.length&&!allowUnsupported)throw new OpenApiSupportError(remoteRefErrors);
  const resolvedOpenApi=remoteRefErrors.length
    ? openapi
    : resolveOpenApiRefs(openapi,{sourcePath:openapiPath,readFile:refPath=>fs.readFileSync(safeProjectPath(root,refPath),'utf8'),parseDocument});
  const supportDiagnostics=dedupeDiagnostics([
    ...rawSupportDiagnostics,
    ...(resolvedOpenApi===openapi?[]:validateOpenApiSupport(resolvedOpenApi))
  ]);
  const supportErrors=supportDiagnostics.filter(item=>item.severity==='error');
  if(supportErrors.length&&!allowUnsupported)throw new OpenApiSupportError(supportErrors);
  const defaultServer=collectOpenApiServers(resolvedOpenApi)[0];
  const apiRoot=resolveOpenApiServerUrl(defaultServer);
  const scope=String(config.scope || 'default');
  const componentSourceDir=normalizeProjectPath(config.components?.source||DEFAULT_COMPONENT_SOURCE);
  const outputDir=normalizeProjectPath(config.components?.output||DEFAULT_COMPONENT_OUTPUT);
  return{root,config,openapiPath,openapiAbsolute,openapi,resolvedOpenApi,supportDiagnostics,apiRoot,scope,componentSourceDir,outputDir};
}

function runtimeEntrySource({scope,apiRoot,operations}){
  return "import * as lit from 'lit';\n"+
    "import * as components from 'metaproject/components';\n"+
    "import * as dataSource from 'metaproject/data-source';\n"+
    "const { createRestClient, configureDataRuntime, getDataRuntime } = dataSource;\n"+
    "export const RUNTIME_ABI_VERSION="+RUNTIME_ABI_VERSION+";\n"+
    "export const RUNTIME_ABI_SYMBOL="+JSON.stringify(RUNTIME_ABI_SYMBOL)+";\n"+
    "const runtimeSymbol=Symbol.for(RUNTIME_ABI_SYMBOL);\n"+
    "if(globalThis[runtimeSymbol]) throw new Error('A Metaproject runtime is already installed for ABI v'+RUNTIME_ABI_VERSION+'. Load one host index.js only.');\n"+
    "export const DEFAULT_SCOPE="+JSON.stringify(scope)+";\n"+
    "export const DEFAULT_API_ROOT="+JSON.stringify(apiRoot)+";\n"+
    "export const OPERATIONS="+JSON.stringify(operations)+";\n"+
    "const scopes=new Map();\n"+
    "const tags=new Map();\n"+
    "export function registerMetaprojectScope({scope='default',operations={},apiRoot='' }={}) {\n"+
    "  const key=String(scope||'default');\n"+
    "  const list=Array.isArray(operations)?operations:Object.values(operations||{});\n"+
    "  const signature=JSON.stringify({operations:list,apiRoot});\n"+
    "  const existing=scopes.get(key);\n"+
    "  if(existing) { if(existing.signature!==signature) throw new Error('Metaproject scope collision: '+key); return getDataRuntime(key); }\n"+
    "  const client=createRestClient({baseUrl:apiRoot});\n"+
    "  scopes.set(key,{signature,apiRoot});\n"+
    "  configureDataRuntime({scope:key,operations:list,client});\n"+
    "  return getDataRuntime(key);\n"+
    "}\n"+
    "export function registerMetaprojectTag(tag,scope) {\n"+
    "  const existing=tags.get(tag);\n"+
    "  if(existing && existing!==scope) throw new Error('Metaproject component tag collision: <'+tag+'> is already registered for '+existing);\n"+
    "  if(!existing && globalThis.customElements?.get?.(tag)) throw new Error('Metaproject component tag collision: <'+tag+'> is already defined outside this runtime.');\n"+
    "  tags.set(tag,scope);\n"+
    "}\n"+
    "export function configureMetaproject({scope=DEFAULT_SCOPE,client,operations,navigate}={}) {\n"+
    "  if(navigate!==undefined) components.configureMetaproject({navigate});\n"+
    "  if(client!==undefined||operations!==undefined) configureDataRuntime({scope,client,operations});\n"+
    "  return components.metaprojectEnvironment();\n"+
    "}\n"+
    "globalThis[runtimeSymbol]=Object.freeze({\n"+
    "  abiVersion:RUNTIME_ABI_VERSION,abiSymbol:RUNTIME_ABI_SYMBOL,\n"+
    "  ...lit,...components,...dataSource,\n"+
    "  ResourceContextController:components.ResourceContextController,\n"+
    "  requestResourceContext:components.requestResourceContext,\n"+
    "  metaprojectEnvironment:components.metaprojectEnvironment,\n"+
    "  registerMetaprojectScope,registerMetaprojectTag,configureMetaproject\n"+
    "});\n"+
    "registerMetaprojectScope({scope:DEFAULT_SCOPE,operations:OPERATIONS,apiRoot:DEFAULT_API_ROOT});\n"+
    "export const defaultClient=getDataRuntime(DEFAULT_SCOPE).client;\n"+
    "export { createRestClient, getDataRuntime };\n";
}
async function loadEsbuild(){try{return await import('esbuild');}catch(error){throw new Error('Metaproject build requires esbuild. Reinstall metaproject with npm before building.\n'+error.message);}}
function helperResolver(components){
  return {name:'metaproject-helpers',setup(build){
    build.onResolve({filter:/^metaproject-helper:/},args=>{
      const tag=args.path.slice('metaproject-helper:'.length);
      const component=components.get(tag);
      if(!component?.scriptPath)throw new Error('Component helper not found for <'+tag+'>.');
      return {path:component.scriptPath};
    });
  }};
}
function runtimeResolver(){
  const require=createRequire(import.meta.url);
  const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
  const paths={'metaproject/components':path.join(root,'components','index.js'),'metaproject/data-source':path.join(root,'data-source','index.js')};
  return {name:'metaproject-runtime',setup(build){
    build.onResolve({filter:/^metaproject\/(?:components|data-source)$/},args=>({path:paths[args.path]}));
    build.onResolve({filter:/^lit$/},()=>({path:require.resolve('lit')}));
  }};
}
function componentResolver(components){
  const prelude="const requiredRuntimeAbi="+RUNTIME_ABI_VERSION+"; const runtimeSymbol=Symbol.for("+JSON.stringify(RUNTIME_ABI_SYMBOL)+"); const r=globalThis[runtimeSymbol]; if(!r)throw new Error('Unsupported Metaproject runtime ABI: component requires v'+requiredRuntimeAbi+' ("+RUNTIME_ABI_SYMBOL+"). Load a compatible host index.js before this component.'); if(r.abiVersion!==requiredRuntimeAbi)throw new Error('Unsupported Metaproject runtime ABI: component requires v'+requiredRuntimeAbi+' but host reports v'+String(r.abiVersion??'unknown')+'.'); ";
  const bridge={
    lit:prelude+"export const LitElement=r.LitElement,html=r.html,nothing=r.nothing,unsafeCSS=r.unsafeCSS,css=r.css,svg=r.svg;",
    core:prelude+"export const ResourceContextController=r.ResourceContextController,requestResourceContext=r.requestResourceContext,metaprojectEnvironment=r.metaprojectEnvironment,registerMetaprojectScope=r.registerMetaprojectScope,registerMetaprojectTag=r.registerMetaprojectTag,configureMetaproject=r.configureMetaproject,readDataField=r.readDataField,writeDataField=r.writeDataField,emitDataAction=r.emitDataAction,humanizeField=r.humanizeField;",
    data:prelude+"export const RestClientError=r.RestClientError,createRestClient=r.createRestClient,configureDataRuntime=r.configureDataRuntime,getDataRuntime=r.getDataRuntime,getDataOperation=r.getDataOperation,subscribeDataRuntime=r.subscribeDataRuntime,invalidateDataRuntime=r.invalidateDataRuntime,invokeDataRequest=r.invokeDataRequest,selectDataSchema=r.selectDataSchema,joinApiUrl=r.joinApiUrl;"
  };
  return {name:'metaproject-shared-runtime',setup(build){
    build.onResolve({filter:/^(?:lit|metaproject\/components)$/},args=>({path:args.path==='lit'?'lit':'core',namespace:'mp-runtime-bridge'}));
    build.onLoad({filter:/.*/,namespace:'mp-runtime-bridge'},args=>({contents:bridge[args.path],loader:'js'}));
    build.onResolve({filter:/^metaproject\/data-source$/},()=>({path:'data',namespace:'mp-runtime-bridge'}));
    build.onResolve({filter:/^(?:lit\/|lit-html(?:\/|$)|@lit\/)/},args=>{throw new Error('Standalone components must import the shared Lit entry (lit), not '+args.path);});
    helperResolver(components).setup(build);
  }};
}
function assertBrowserNativeOutput(outputAbsolute){const bareImport=/\b(?:from\s*|import\s*)['"](?:lit|metaproject(?:\/|['"]))/;for(const file of walk(outputAbsolute).filter(file=>file.endsWith('.js'))){const source=fs.readFileSync(file,'utf8');if(bareImport.test(source))throw new Error(`Generated static asset still contains an unresolved npm import: ${file}`);}}
function parseDocument(source,filePath){const text=String(source||'').trim();if(!text)return{};return String(filePath).toLowerCase().endsWith('.json')?JSON.parse(text):parseYaml(text);}
function safeProjectPath(root,relative){const target=path.resolve(root,normalizeProjectPath(relative));const rel=path.relative(root,target);if(rel.startsWith('..')||path.isAbsolute(rel))throw new Error(`Path escapes the Metaproject root: ${relative}`);return target;}
function normalizeProjectPath(value){return String(value||'').replace(/\\/g,'/').replace(/^\.\//,'').replace(/\/$/,'');}
function dedupeDiagnostics(items){const seen=new Set();return(items||[]).filter(item=>{const key=`${item.severity}|${item.code}|${item.path||''}|${item.message}`;if(seen.has(key))return false;seen.add(key);return true;});}
function walk(dir){if(!fs.existsSync(dir))return[];const files=[];for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const target=path.join(dir,entry.name);if(entry.isDirectory())files.push(...walk(target));else files.push(target);}return files;}
