#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);
const command = argv.shift() || 'help';

try {
  if (command === 'init') {
    const { initProject } = await import('../init/index.js');
    const options = parseInitArgs(argv);
    const result = initProject(options);
    printInitResult(result);
  } else if (command === 'check') {
    const { checkProject } = await import('../project/check.js');
    const { root } = parseRootArgs(argv);
    const result=checkProject({root});
    printCheckResult(result);
    if(result.errors.length)process.exitCode=1;
  } else if (command === 'build') {
    const { buildProject } = await import('../build/index.js');
    const options = parseBuildArgs(argv);
    const result = await buildProject(options);
    console.log(`Metaproject build complete.`);
    console.log(`  Components: ${result.components.count}`);
    console.log(`  Operations: ${result.api.operations.length}`);
    console.log(`  Output:     ${result.outputDir}`);
  } else if (command === 'import-openapi') {
    const { importProjectOpenApi } = await import('../openapi/project-tools.js');
    const { root, source, force } = parseImportArgs(argv);
    const result = await importProjectOpenApi({ root, source, force });
    console.log(`Imported OpenAPI spec into ${result.path}`);
    console.log(`  Source:     ${result.source}`);
    console.log(`  Operations: ${result.operations}`);
    console.log(`  Schemas:    ${result.schemas}`);
  } else if (command === 'api') {
    const { runApiCli } = await import('../api/index.js');
    const result = await runApiCli(argv);
    if (result?.exitCode) process.exitCode = result.exitCode;
  } else if (command === 'openapi') {
    const subcommand = argv.shift();
    if (subcommand === 'check-examples') {
      const { root } = parseRootArgs(argv);
      const { loadProjectBuildContext } = await import('../build/index.js');
      const { validateOpenApiExamples } = await import('../openapi/index.js');
      const project = loadProjectBuildContext(root);
      const diagnostics = validateOpenApiExamples(project.resolvedOpenApi);
      if (diagnostics.length) {
        const details = diagnostics.map(item => `  - ${item.message}`).join('\n');
        throw new Error(`OpenAPI examples are incomplete:\n${details}`);
      }
      console.log('OpenAPI examples are complete.');
    } else if (subcommand === 'upsert-operation' || subcommand === 'upsert-schema') {
      const { upsertProjectOperation, upsertProjectSchema } = await import('../openapi/project-tools.js');
      const { root, input } = parseOpenApiMutationArgs(argv);
      const values = readJsonInput(input);
      if (subcommand === 'upsert-operation') {
        const result = upsertProjectOperation({ root, values });
        console.log(`${result.created ? 'Created' : 'Updated'} ${result.method} ${result.operationPath} (${result.operationId})`);
      } else {
        const result = upsertProjectSchema({ root, values });
        console.log(`${result.created ? 'Created' : 'Updated'} Schema ${result.name}`);
      }
    } else {
      throw new Error('Usage: metaproject openapi check-examples [project-root] | upsert-operation|upsert-schema --input FILE [project-root]');
    }
  } else if (command === '--version' || command === '-v' || command === 'version') {
    const { readFile } = await import('node:fs/promises');
    const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
    console.log(pkg.version);
  } else {
    printHelp();
    if (!['help','--help','-h'].includes(command)) process.exitCode = 1;
  }
} catch (error) {
  const concise=['ApiCliError','MetaprojectConfigError','OpenApiSupportError','MetaprojectProjectError'].includes(error?.name);
  console.error(concise ? error.message : (error?.stack || error?.message || String(error)));
  process.exitCode = Number.isInteger(error?.exitCode) ? error.exitCode : 1;
}

function parseInitArgs(args) {
  let root = '.';
  let name;
  let agents = true;
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--name') {
      if (!args[i + 1]) throw new Error('--name requires a value.');
      name = args[++i];
    } else if (arg === '--no-agents') agents = false;
    else if (arg === '--agents') agents = true;
    else if (arg.startsWith('-')) throw new Error(`Unknown init option: ${arg}`);
    else root = arg;
  }
  return { root, name, agents };
}

function parseBuildArgs(args) {
  const result = parseRootArgs(args.filter(arg => !['--minify','--sourcemap'].includes(arg)));
  return {
    ...result,
    minify:args.includes('--minify') ? true : undefined,
    sourcemap:args.includes('--sourcemap') ? true : undefined
  };
}

function parseImportArgs(args) {
  let root='.'; let source; let force=false;
  for (const arg of args) {
    if (arg === '--force') force=true;
    else if (arg.startsWith('-')) throw new Error(`Unknown import-openapi option: ${arg}`);
    else if (!source) source=arg;
    else root=arg;
  }
  if (!source) throw new Error('Usage: metaproject import-openapi SOURCE [project-root] [--force]');
  return { root, source, force };
}

function parseOpenApiMutationArgs(args) {
  let root='.'; let input;
  for (let i=0;i<args.length;i++) {
    const arg=args[i];
    if (arg==='--input') { if(!args[i+1])throw new Error('--input requires a JSON file or -.'); input=args[++i]; }
    else if(arg.startsWith('-'))throw new Error(`Unknown openapi option: ${arg}`);
    else root=arg;
  }
  if(!input)throw new Error('--input is required.');
  return { root, input };
}

function readJsonInput(input) {
  const source = input === '-' ? fs.readFileSync(0,'utf8') : fs.readFileSync(path.resolve(input),'utf8');
  const value = JSON.parse(source);
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('OpenAPI mutation input must be a JSON object.');
  return value;
}

function parseRootArgs(args) {
  const positional = args.filter(arg => !arg.startsWith('-'));
  const unknown = args.filter(arg => arg.startsWith('-'));
  if (unknown.length) throw new Error(`Unknown option: ${unknown[0]}`);
  if (positional.length > 1) throw new Error('Only one project root may be specified.');
  return { root:positional[0] || '.' };
}

function printInitResult(result) {
  console.log(`Initialized Metaproject in ${result.root}`);
  console.log(`  Name:      ${result.name}`);
  if (result.created.length) console.log(`  Created:   ${result.created.join(', ')}`);
  else console.log('  Created:   nothing (project was already initialized)');
  if (result.preserved.length) console.log(`  Preserved: ${result.preserved.join(', ')}`);
  if (result.agents?.changed) console.log('  AGENTS.md: Metaproject managed block updated');

  console.log('\nChoose the path that matches this project:');
  console.log('  Existing app with OpenAPI:');
  console.log('    metaproject import-openapi ./path/to/openapi.yaml');
  console.log('  Existing app without adequate OpenAPI:');
  console.log('    follow node_modules/metaproject/skills/application-analysis/SKILL.md');
  console.log('  New app:');
  console.log('    follow node_modules/metaproject/skills/project-bootstrap/SKILL.md');
  console.log('\nThen:');
  console.log('  metaproject check');
  console.log('  metaproject build');
}

function printCheckResult(result) {
  console.log('Metaproject check');
  console.log(`  Config:     ${result.configPath}`);
  console.log(`  OpenAPI:    ${result.openapiPath}`);
  console.log(`  Components: ${result.componentSourceDir} (${result.componentCount} source)`);
  console.log(`  Scope:      ${result.scope}`);
  console.log(`  Schemas:    ${result.schemaCount}`);
  console.log(`  Operations: ${result.operationCount}`);
  console.log(`  Health:     ${result.errors.length} error(s), ${result.warnings.length} warning(s)`);
  for(const diagnostic of result.diagnostics){
    const target=diagnostic.path || diagnostic.sourcePath || diagnostic.resource;
    const location=target ? ` ${target}` : '';
    console.log(`  ${diagnostic.severity === 'warning' ? 'WARN' : 'ERROR'} ${diagnostic.code}${location}: ${diagnostic.message}`);
  }
}

function printHelp() {
  console.log(`Metaproject\n\nUsage:\n  metaproject init [project-root] [--name NAME] [--no-agents]\n  metaproject check [project-root]\n  metaproject build [project-root] [--minify] [--sourcemap]\n  metaproject import-openapi SOURCE [project-root] [--force]\n  metaproject api list [project-root]\n  metaproject api show OPERATION [project-root]\n  metaproject api call OPERATION [project-root] [parameters/options]\n  metaproject openapi check-examples [project-root]\n  metaproject openapi upsert-operation --input FILE [project-root]\n  metaproject openapi upsert-schema --input FILE [project-root]\n\n  metaproject --version\n\nSOURCE may be a local YAML/JSON file, file:// URL, or HTTP(S) URL.\n\nStart here:\n  npm install --save-dev metaproject\n  metaproject init\n\nChoose a project path:\n  Existing app with OpenAPI:\n    metaproject import-openapi ./path/to/openapi.yaml\n  Existing app without adequate OpenAPI:\n    follow node_modules/metaproject/skills/application-analysis/SKILL.md\n  New app:\n    follow node_modules/metaproject/skills/project-bootstrap/SKILL.md\n\nValidate and build:\n  metaproject check\n  metaproject build\n`);
}
