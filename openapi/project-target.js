import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { parseMetaprojectConfig } from '../project/config.js';
import { createDefaultOpenApiSource } from '../project/index.js';

const DEFAULT_OPENAPI='openapi.yaml';

/** Resolve the file selected by metaproject.yaml, not an implicit root copy. */
export function resolveProjectOpenApiTarget(root=process.cwd()){
  root=fs.realpathSync(path.resolve(root));
  const configFile=path.join(root,'metaproject.yaml');
  let config={};
  if(fs.existsSync(configFile)){
    if(!fs.lstatSync(configFile).isFile())throw invalid('metaproject.yaml must be a regular file');
    config=parseMetaprojectConfig(fs.readFileSync(configFile,'utf8'),{filePath:'metaproject.yaml'});
  }
  const selected=config.openapi||DEFAULT_OPENAPI;
  if(path.isAbsolute(selected))throw invalid('openapi must be project-relative');
  const file=path.resolve(root,selected);
  const relative=path.relative(root,file);
  if(!relative||relative==='..'||relative.startsWith('..'+path.sep)||path.isAbsolute(relative))
    throw invalid('openapi must be inside the project root');
  const extension=path.extname(file).toLowerCase();
  if(!['.yaml','.yml','.json'].includes(extension))throw invalid('openapi must use .yaml, .yml, or .json');
  const output=path.resolve(root,config.components?.output||'public/components');
  if(file===output||inside(output,file))throw invalid('openapi may not target generated output');
  let cursor=root;
  const parts=relative.split(path.sep);
  for(let i=0;i<parts.length;i++){
    cursor=path.join(cursor,parts[i]);
    let stat;
    try{stat=fs.lstatSync(cursor);}
    catch(error){if(error.code==='ENOENT')break;throw error;}
    if(stat.isSymbolicLink())throw invalid('openapi traverses symlink '+path.relative(root,cursor));
    if(i<parts.length-1&&!stat.isDirectory())throw invalid('openapi parent is not a directory: '+path.relative(root,cursor));
    if(i===parts.length-1&&!stat.isFile())throw invalid('openapi must be a regular file');
  }
  return {root,file,relative:relative.replaceAll('\\','/'),format:extension==='.json'?'json':'yaml'};
}

export function readProjectOpenApi(target){
  if(!fs.existsSync(target.file))return parseYaml(createDefaultOpenApiSource({title:'Metaproject API'}));
  let doc;
  try{
    const text=fs.readFileSync(target.file,'utf8');
    doc=target.format==='json'?JSON.parse(text):parseYaml(text);
  }catch(error){throw invalid('cannot parse '+target.relative+': '+error.message);}
  if(!doc||typeof doc!=='object'||Array.isArray(doc)||!/^3\.(0|1)\./.test(String(doc.openapi||'')))
    throw invalid(target.relative+' is not an OpenAPI 3.0/3.1 document; refusing to overwrite unrelated data');
  return doc;
}

export function writeProjectOpenApi(target,doc){
  const text=target.format==='json'?JSON.stringify(doc,null,2)+'\n':stringifyYaml(doc);
  if(resolveProjectOpenApiTarget(target.root).file!==target.file)throw invalid('openapi target changed before write');
  fs.mkdirSync(path.dirname(target.file),{recursive:true});
  const temp=path.join(path.dirname(target.file),'.metaproject-openapi-'+randomUUID()+'.tmp');
  try{
    const existing=fs.existsSync(target.file)?fs.statSync(target.file):null;
    fs.writeFileSync(temp,text,{flag:'wx',mode:existing?existing.mode&0o777:0o666});
    if(resolveProjectOpenApiTarget(target.root).file!==target.file)throw invalid('openapi target changed before write');
    fs.renameSync(temp,target.file);
  }finally{fs.rmSync(temp,{force:true});}
}
function inside(root,file){
  const rel=path.relative(root,file);
  return rel!==''&&rel!=='..'&&!rel.startsWith('..'+path.sep)&&!path.isAbsolute(rel);
}
function invalid(msg){
  const error=new Error('Invalid Metaproject OpenAPI target: '+msg+'.');
  error.name='MetaprojectProjectError';
  return error;
}
