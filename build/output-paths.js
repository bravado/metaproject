import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

/** Protect user-owned project files before writing any build artifacts. */
export function resolveBuildOutputPaths({root,outputDir,sourceDir,openapiPath,outputApi,componentTags=[]}) {
  root=fs.realpathSync(path.resolve(root));
  const output=projectPath(root,outputDir,'components.output');
  const source=projectPath(root,sourceDir,'components.source');
  const openapi=projectPath(root,openapiPath,'openapi');
  const config=path.join(root,'metaproject.yaml');
  const api=projectPath(root,outputApi||path.join(outputDir,'api.js'),'components.output_api');

  if(output===root) fail('components.output','cannot be the project root');
  rejectSymlinkPath(root,output,'components.output');
  rejectSymlinkPath(root,api,'components.output_api');
  if(!inside(output,api)||api===output)fail('components.output_api','must be a file inside components.output');

  // Compare both lexical and physical paths, so a symlinked source or OpenAPI
  // file cannot alias the generated directory.
  const physicalOutput=physicalPath(output);
  for(const [name,file] of [['components.source',source],['openapi',openapi],['metaproject.yaml',config]]){
    if(overlaps(output,file)||overlaps(physicalOutput,physicalPath(file))){
      fail('components.output',`overlaps ${name}; generated files must not replace project inputs`);
    }
  }
  if(overlaps(source,output) || overlaps(physicalPath(source),physicalOutput)){
    fail('components.output','overlaps components.source; source and generated output must be separate');
  }

  const apiRelative=path.relative(output,api).replaceAll('\\','/');
  const reserved=new Set(['api.js','index.js','all.js','manifest.json',...componentTags.map(tag=>tag+'.js')]);
  for(const generated of reserved){
    if(apiRelative!==generated&&apiRelative.startsWith(generated+'/')){
      fail('components.output_api',`uses generated file ${generated} as a parent directory`);
    }
    if(apiRelative===generated&&generated!=='api.js'){
      fail('components.output_api',`conflicts with generated artifact ${generated}`);
    }
  }
  if(path.extname(apiRelative)!=='.js')fail('components.output_api','must name a .js generated module');

  return {root,output,api,apiRelative};
}

export function assertOwnedGeneratedOutput({output}) {
  if(!fs.existsSync(output))return;
  const stat=fs.lstatSync(output);
  if(stat.isSymbolicLink()||!stat.isDirectory())fail('components.output','must be a directory, not a symlink or file');
  const entries=listEntries(output);
  if(entries.length===0)return;
  const manifestPath=path.join(output,'manifest.json');
  if(!fs.existsSync(manifestPath)||!fs.lstatSync(manifestPath).isFile()){
    fail('components.output','already contains files without a Metaproject manifest; refusing to remove user files');
  }
  let manifest;
  try{manifest=JSON.parse(fs.readFileSync(manifestPath,'utf8'));}
  catch{fail('components.output','has an invalid generated manifest; refusing to remove files');}
  if(manifest?.generatedBy!=='metaproject'||manifest?.version!==1){
    fail('components.output','is not a recognized Metaproject generated directory');
  }
  const allowed=new Set(['manifest.json','index.js','all.js','api.js']);
  const add=file=>{
    if(typeof file!=='string'||!file||path.isAbsolute(file)||file.includes('\\')||file.split('/').some(part=>!part||part==='.'||part==='..')) {
      fail('components.output','manifest lists an unsafe generated path');
    }
    allowed.add(file);
  };
  for(const item of Object.values(manifest.components||{})) add(item?.file);
  if(manifest.outputApi)add(manifest.outputApi);
  for(const file of [...allowed]) if(file.endsWith('.js'))allowed.add(file+'.map');
  for(const entry of entries){
    if(entry.type!=='file'||!allowed.has(entry.relative)){
      fail('components.output',`contains unrecognized or linked file ${entry.relative}; refusing to remove user data`);
    }
  }
}

/** Stage in an isolated sibling; preserve old generated assets if compilation fails. */
export function createOutputStage(output){
  const parent=path.dirname(output);
  fs.mkdirSync(parent,{recursive:true});
  return fs.mkdtempSync(path.join(parent,'.metaproject-stage-'));
}

export function commitGeneratedOutput(stage,output){
  const backup=path.join(path.dirname(output),'.metaproject-backup-'+randomUUID());
  const existed=fs.existsSync(output);
  // Check again immediately before replacement to avoid clobbering newly added files.
  assertOwnedGeneratedOutput({output});
  if(existed)fs.renameSync(output,backup);
  try{fs.renameSync(stage,output);}
  catch(error){
    if(existed) {
      try{fs.renameSync(backup,output);}
      catch(restoreError){
        throw new AggregateError([error,restoreError],`Could not install generated output or restore backup at ${backup}`);
      }
    }
    throw error;
  }
  if(existed)fs.rmSync(backup,{recursive:true,force:true});
}

function projectPath(root,relative,label){
  if(typeof relative!=='string'||!relative||path.isAbsolute(relative))fail(label,'must be a non-empty project-relative path');
  const resolved=path.resolve(root,relative);
  if(!inside(root,resolved) && resolved!==root)fail(label,'escapes the project root');
  return resolved;
}
function inside(parent,child){const relative=path.relative(parent,child);return relative!==''&&!relative.startsWith('..'+path.sep)&&relative!=='..'&&!path.isAbsolute(relative);}
function overlaps(a,b){return a===b||inside(a,b)||inside(b,a);}
function rejectSymlinkPath(root,target,label){
  let current=root;
  for(const part of path.relative(root,target).split(path.sep).filter(Boolean)){
    current=path.join(current,part);
    try{if(fs.lstatSync(current).isSymbolicLink())fail(label,`passes through symbolic link ${path.relative(root,current)}`);}
    catch(error){if(error.code==='ENOENT')break;throw error;}
  }
}
function physicalPath(file){
  let current=file;
  const suffix=[];
  while(!fs.existsSync(current)){
    const parent=path.dirname(current);
    if(parent===current)break;
    suffix.unshift(path.basename(current));
    current=parent;
  }
  return path.resolve(fs.realpathSync(current),...suffix);
}
function listEntries(dir,relative=''){
  const out=[];
  for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
    const child=path.join(dir,entry.name);
    const name=path.posix.join(relative,entry.name);
    if(entry.isSymbolicLink())out.push({type:'symlink',relative:name});
    else if(entry.isDirectory())out.push(...listEntries(child,name));
    else out.push({type:entry.isFile()?'file':'other',relative:name});
  }
  return out;
}
export class MetaprojectOutputError extends Error {
  constructor(field,why){
    super(`Unsafe Metaproject output path ${field}: ${why}.`);
    this.name='MetaprojectOutputError';
    this.field=field;
  }
}
function fail(field,why){throw new MetaprojectOutputError(field,why);}
