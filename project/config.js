import fs from 'node:fs';
import { parse as parseYaml } from 'yaml';

export const METAPROJECT_SCHEMA=Object.freeze(
  JSON.parse(fs.readFileSync(new URL('./metaproject.schema.json',import.meta.url),'utf8'))
);

export class MetaprojectConfigError extends Error {
  constructor(filePath,diagnostics,{cause}={}) {
    super(formatConfigError(filePath,diagnostics),cause ? {cause} : undefined);
    this.name='MetaprojectConfigError';
    this.filePath=filePath;
    this.diagnostics=diagnostics;
  }
}

/** Parse and validate metaproject.yaml against the shipped configuration schema. */
export function parseMetaprojectConfig(source,{filePath='metaproject.yaml'}={}) {
  let config;
  try {
    config=parseYaml(String(source ?? ''));
  } catch(error) {
    const position=error?.linePos?.[0];
    const where=position ? ` at line ${position.line}, column ${position.col}` : '';
    throw new MetaprojectConfigError(filePath,[{
      path:'',
      message:`invalid YAML${where}: ${error?.message || String(error)}`
    }],{cause:error});
  }
  if(config == null) config={};
  return validateMetaprojectConfig(config,{filePath});
}

/** Validate an already parsed configuration object. Returns the same object. */
export function validateMetaprojectConfig(config,{filePath='metaproject.yaml'}={}) {
  const diagnostics=[];
  validateValue(config,METAPROJECT_SCHEMA,'',diagnostics);
  if(diagnostics.length) throw new MetaprojectConfigError(filePath,diagnostics);
  return config;
}

function validateValue(value,schema,currentPath,diagnostics) {
  if(schema.type && !matchesType(value,schema.type)) {
    diagnostics.push({path:currentPath,message:`must be ${article(schema.type)} ${schema.type}.`});
    return;
  }

  if(Object.prototype.hasOwnProperty.call(schema,'const') && value !== schema.const) {
    diagnostics.push({path:currentPath,message:`must be ${JSON.stringify(schema.const)}.`});
  }

  if(typeof value === 'string') {
    if(Number.isInteger(schema.minLength) && value.length < schema.minLength) {
      diagnostics.push({path:currentPath,message:'must not be empty.'});
    }
    if(schema.pattern && !new RegExp(schema.pattern).test(value)) {
      diagnostics.push({path:currentPath,message:schema['x-error-message'] || `must match ${schema.pattern}.`});
    }
  }

  if(schema.type !== 'object' || !matchesType(value,'object')) return;

  for(const key of schema.required || []) {
    if(!Object.prototype.hasOwnProperty.call(value,key)) {
      diagnostics.push({path:joinPath(currentPath,key),message:'is required.'});
    }
  }

  const properties=schema.properties || {};
  for(const [key,item] of Object.entries(value)) {
    const itemPath=joinPath(currentPath,key);
    if(Object.prototype.hasOwnProperty.call(properties,key)) {
      validateValue(item,properties[key],itemPath,diagnostics);
      continue;
    }
    if(schema.additionalProperties === false) {
      if(currentPath === '' && key === 'api_root') {
        diagnostics.push({
          path:itemPath,
          message:'api_root was removed. Define the API endpoint with the top-level OpenAPI servers list instead.'
        });
      } else {
        const supported=Object.keys(properties).join(', ');
        diagnostics.push({
          path:itemPath,
          message:`unknown configuration field. Supported fields: ${supported || '(none)'}.`
        });
      }
    }
  }
}

function matchesType(value,type) {
  if(type === 'object') return value !== null && typeof value === 'object' && !Array.isArray(value);
  if(type === 'integer') return Number.isInteger(value);
  return typeof value === type;
}

function joinPath(parent,key) {
  return parent ? `${parent}.${key}` : key;
}

function article(type) {
  return /^[aeiou]/i.test(type) ? 'an' : 'a';
}

function formatConfigError(filePath,diagnostics) {
  const lines=diagnostics.map(item=>`  - ${item.path || '<root>'}: ${item.message}`);
  return `Invalid ${filePath} configuration:\n${lines.join('\n')}`;
}
