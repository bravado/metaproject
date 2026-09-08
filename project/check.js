import fs from 'node:fs';
import path from 'node:path';
import { loadProjectBuildContext } from '../build/index.js';
import { validateOpenApiExamples } from '../openapi/index.js';
import { buildProjectIndex } from './indexer.js';

/** Validate the API/component contract without producing build output. */
export function checkProject({ root = process.cwd() } = {}) {
  root=path.resolve(root);
  const context=loadProjectBuildContext(root);
  const files=readComponentFiles(root,context.componentSourceDir);
  const index=buildProjectIndex({files,openapi:context.resolvedOpenApi,project:context.config,componentSource:context.componentSourceDir});
  const exampleDiagnostics=validateOpenApiExamples(context.resolvedOpenApi).map(item=>({
    severity:'error',
    code:item.code || 'openapi-example',
    resource:item.resource || item.operationId || 'openapi.yaml',
    message:item.message
  }));
  const diagnostics=[...index.diagnostics,...exampleDiagnostics];
  return {
    root,
    config:context.config,
    openapiPath:context.openapiPath,
    componentSourceDir:context.componentSourceDir,
    outputDir:context.outputDir,
    index,
    diagnostics,
    errors:diagnostics.filter(item=>item.severity==='error'),
    warnings:diagnostics.filter(item=>item.severity==='warning')
  };
}

function readComponentFiles(root,sourceDir) {
  const source=path.resolve(root,sourceDir);
  const files={};
  if(!fs.existsSync(source))return files;
  for(const file of walk(source)){
    const relative=normalize(path.relative(root,file));
    if(!/\.(?:html|css|js|ts)$/.test(relative))continue;
    files[relative]=fs.readFileSync(file,'utf8');
  }
  return files;
}
function walk(dir){const files=[];for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const target=path.join(dir,entry.name);if(entry.isDirectory())files.push(...walk(target));else files.push(target);}return files;}
function normalize(value){return String(value||'').replace(/\\/g,'/');}
