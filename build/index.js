import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { parse as parseYaml } from 'yaml';
import { generateApiClientModule, collectApiOperations } from '../api-client/index.js';
import { resolveOpenApiRefs, assertOpenApiExamples } from '../openapi/index.js';
import { compileComponentModule, parseComponentSource, tagFromComponentPath } from '../compiler/index.js';

export const DEFAULT_COMPONENT_SOURCE = 'components';
export const DEFAULT_COMPONENT_OUTPUT = 'public/components';
export const DEFAULT_OPENAPI_PATH = 'openapi.yaml';

/** Build every static browser artifact owned by Metaproject. */
export async function buildProject({ root = process.cwd(), minify, sourcemap } = {}) {
  root = path.resolve(root);
  const project = loadProjectBuildContext(root);
  assertOpenApiExamples(project.resolvedOpenApi);
  await loadEsbuild();
  const outputAbsolute = safeProjectPath(root, project.outputDir);

  // public/components is generated output. Starting clean prevents removed or
  // renamed components from leaving stale browser modules behind.
  fs.rmSync(outputAbsolute, { recursive:true, force:true });
  fs.mkdirSync(outputAbsolute, { recursive:true });

  const apiClient = buildProjectApiClient({ root, context:project });
  const components = await buildProjectComponents({
    root,
    context:project,
    minify:minify ?? project.config.build?.minify ?? false,
    sourcemap:sourcemap ?? project.config.build?.sourcemap ?? false
  });

  return {
    root,
    config:project.config,
    outputDir:project.outputDir,
    apiClient,
    components
  };
}

/** Build only the generated OpenAPI client. */
export function buildProjectApiClient({ root = process.cwd(), outputPath, context } = {}) {
  root = path.resolve(root);
  const project = context || loadProjectBuildContext(root);
  const targetRelative = normalizeProjectPath(outputPath || project.config.components?.output_api || `${project.outputDir}/api.js`);
  const targetAbsolute = safeProjectPath(root, targetRelative);
  const source = generateApiClientModule({ openapi:project.resolvedOpenApi, apiRoot:project.apiRoot });
  fs.mkdirSync(path.dirname(targetAbsolute), { recursive:true });
  fs.writeFileSync(targetAbsolute, source);

  return {
    root,
    config:project.config,
    apiRoot:project.apiRoot,
    openapiPath:project.openapiPath,
    outputPath:targetRelative,
    operations:collectApiOperations(project.resolvedOpenApi),
    source
  };
}

/**
 * Compile HTML-first and advanced single-file project components into
 * browser-native ESM assets.
 *
 * Output contains one entry module per component, index.js, runtime.js, api.js,
 * a manifest, and optional shared chunks. No output module contains bare npm
 * imports, so a PHP application can serve public/components directly.
 */
export async function buildProjectComponents({ root = process.cwd(), context, minify = false, sourcemap = false } = {}) {
  root = path.resolve(root);
  const project = context || loadProjectBuildContext(root);
  const components = discoverProjectComponents(root, project.componentSourceDir);
  const outputAbsolute = safeProjectPath(root, project.outputDir);
  fs.mkdirSync(outputAbsolute, { recursive:true });

  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'metaproject-build-'));
  try {
    const entryPoints = {};
    const manifest = {
      version:1,
      generatedBy:'metaproject',
      apiRoot:project.apiRoot,
      openapi:project.openapiPath,
      components:{}
    };

    // API is also an esbuild entry so all generated imports are internal and
    // output-relative paths remain correct even when code splitting is used.
    const apiSource = generateApiClientModule({ openapi:project.resolvedOpenApi, apiRoot:project.apiRoot });
    const apiEntry = path.join(temp, 'api.js');
    fs.writeFileSync(apiEntry, apiSource);
    entryPoints.api = apiEntry;

    const runtimeEntry = path.join(temp, 'runtime.js');
    fs.writeFileSync(runtimeEntry, runtimeEntrySource());
    entryPoints.runtime = runtimeEntry;

    for (const component of components.values()) {
      if (component.advanced) {
        const source = fs.readFileSync(component.sourcePath, 'utf8');
        const extension = path.extname(component.sourcePath).toLowerCase() === '.ts' ? '.ts' : '.js';
        const generatedPath = path.join(temp, `${component.tag}${extension}`);
        fs.writeFileSync(generatedPath, advancedComponentEntrySource(source));
        entryPoints[component.tag] = generatedPath;
        manifest.components[component.tag] = {
          file:`${component.tag}.js`,
          title:component.title,
          properties:[],
          actions:[],
          actionOperations:{},
          dependencies:[]
        };
        continue;
      }

      const source = fs.readFileSync(component.htmlPath, 'utf8');
      const css = component.stylePath ? fs.readFileSync(component.stylePath, 'utf8') : '';
      const scriptSource = component.scriptPath ? fs.readFileSync(component.scriptPath, 'utf8') : '';
      const definition = parseComponentSource(source, { tag:component.tag, path:component.relativeHtmlPath });
      const dependencyImports = definition.dependencies
        .filter(dependency => components.has(dependency))
        .map(dependency => `import './${dependency}.js';`)
        .join('\n');
      const scriptImport = component.scriptPath ? `metaproject-helper:${component.tag}` : null;
      const compiled = compileComponentModule({
        tag:component.tag,
        path:component.relativeHtmlPath,
        source,
        css,
        scriptImport,
        scriptSource
      });
      const generatedPath = path.join(temp, `${component.tag}.js`);
      fs.writeFileSync(generatedPath, `import './runtime.js';\n${dependencyImports}${dependencyImports ? '\n' : ''}${compiled}`);
      entryPoints[component.tag] = generatedPath;
      manifest.components[component.tag] = {
        file:`${component.tag}.js`,
        title:definition.title,
        properties:definition.properties,
        actions:definition.actions,
        actionOperations:definition.actionOperations,
        dependencies:definition.dependencies
      };
    }

    const indexEntry = path.join(temp, 'index.js');
    fs.writeFileSync(indexEntry, indexEntrySource([...components.keys()].sort()));
    entryPoints.index = indexEntry;

    const esbuild = await loadEsbuild();
    await esbuild.build({
      entryPoints,
      outdir:outputAbsolute,
      bundle:true,
      splitting:true,
      format:'esm',
      platform:'browser',
      target:['es2022'],
      entryNames:'[name]',
      chunkNames:'_chunks/[name]-[hash]',
      assetNames:'_assets/[name]-[hash]',
      minify:Boolean(minify),
      sourcemap:Boolean(sourcemap),
      logLevel:'silent',
      plugins:[metaprojectSelfResolver(components)]
    });

    fs.writeFileSync(path.join(outputAbsolute, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

    const outputFiles = walk(outputAbsolute)
      .map(file => normalizeProjectPath(path.relative(root, file)))
      .sort();
    assertBrowserNativeOutput(outputAbsolute);

    return {
      sourceDir:project.componentSourceDir,
      outputDir:project.outputDir,
      count:components.size,
      tags:[...components.keys()].sort(),
      manifest,
      files:outputFiles
    };
  } finally {
    fs.rmSync(temp, { recursive:true, force:true });
  }
}

export function discoverProjectComponents(root, sourceDir = DEFAULT_COMPONENT_SOURCE) {
  root = path.resolve(root);
  const sourceAbsolute = safeProjectPath(root, sourceDir);
  const out = new Map();
  if (!fs.existsSync(sourceAbsolute)) return out;
  const files = walk(sourceAbsolute);

  for (const htmlPath of files.filter(file => path.basename(file) === 'component.html')) {
    const tag = tagFromComponentPath(htmlPath);
    if (out.has(tag)) throw new Error(`Duplicate Metaproject component tag <${tag}>.`);
    const dir = path.dirname(htmlPath);
    const scriptPath = ['component.ts', 'component.js'].map(name => path.join(dir, name)).find(file => fs.existsSync(file)) || null;
    const stylePath = path.join(dir, 'style.css');
    out.set(tag, {
      tag,
      advanced:false,
      htmlPath,
      relativeHtmlPath:normalizeProjectPath(path.relative(root, htmlPath)),
      scriptPath,
      stylePath:fs.existsSync(stylePath) ? stylePath : null
    });
  }

  for (const sourcePath of files.filter(isAdvancedComponentCandidate)) {
    const source = fs.readFileSync(sourcePath, 'utf8');
    const tag = advancedComponentTag(source);
    if (!tag) continue;
    if (out.has(tag)) throw new Error(`Duplicate Metaproject component tag <${tag}>.`);
    out.set(tag, {
      tag,
      advanced:true,
      title:humanizeComponentTag(tag),
      sourcePath,
      relativeSourcePath:normalizeProjectPath(path.relative(root, sourcePath))
    });
  }
  return out;
}

export function loadProjectBuildContext(root = process.cwd()) {
  root = path.resolve(root);
  const configPath = path.join(root, 'metaproject.yaml');
  if (!fs.existsSync(configPath)) throw new Error(`Metaproject project not found: ${configPath}. Run "npx metaproject init" first.`);
  const config = parseYaml(fs.readFileSync(configPath, 'utf8')) || {};
  const openapiPath = normalizeProjectPath(config.openapi || DEFAULT_OPENAPI_PATH);
  const openapiAbsolute = safeProjectPath(root, openapiPath);
  if (!fs.existsSync(openapiAbsolute)) throw new Error(`OpenAPI file not found: ${openapiPath}. Run "npx metaproject init" first.`);

  const openapi = parseDocument(fs.readFileSync(openapiAbsolute, 'utf8'), openapiPath) || {};
  const resolvedOpenApi = resolveOpenApiRefs(openapi, {
    sourcePath:openapiPath,
    readFile:refPath => fs.readFileSync(safeProjectPath(root, refPath), 'utf8'),
    parseDocument
  });
  const apiRoot = config.api_root ?? '';
  if (typeof apiRoot !== 'string') throw new Error('metaproject.yaml api_root must be a string.');

  const componentSourceDir = normalizeProjectPath(config.components?.source || DEFAULT_COMPONENT_SOURCE);
  const outputDir = normalizeProjectPath(config.components?.output || DEFAULT_COMPONENT_OUTPUT);

  return { root, config, openapiPath, openapiAbsolute, openapi, resolvedOpenApi, apiRoot, componentSourceDir, outputDir };
}

function runtimeEntrySource() {
  return `import api, { createApiClient, DEFAULT_API_ROOT, OPERATIONS, ApiClientError } from './api.js';\n` +
    `import { configureMetaproject as configureRuntime } from 'metaproject/components';\n` +
    `configureRuntime({ api });\n` +
    `export { api, createApiClient, DEFAULT_API_ROOT, OPERATIONS, ApiClientError };\n` +
    `export function configureMetaproject(options = {}) { return configureRuntime({ ...options, api: options.api ?? api }); }\n`;
}

function advancedComponentEntrySource(source) {
  return `import './runtime.js';\n` +
    `import { metaprojectEnvironment } from 'metaproject/components';\n` +
    `const api = new Proxy({}, { get(_target, key) { return metaprojectEnvironment().api[key]; } });\n` +
    `const navigate = (...args) => metaprojectEnvironment().navigate(...args);\n` +
    `${source}\n`;
}

function indexEntrySource(tags) {
  const imports = tags.map(tag => `import './${tag}.js';`).join('\n');
  return `export * from './runtime.js';\n${imports}${imports ? '\n' : ''}`;
}

async function loadEsbuild() {
  try { return await import('esbuild'); }
  catch (error) {
    throw new Error(`Metaproject build requires its esbuild dependency. Reinstall metaproject with npm before building.\n${error.message}`);
  }
}

function metaprojectSelfResolver(components) {
  const require = createRequire(import.meta.url);
  const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const componentsPath = path.join(packageRoot, 'components', 'index.js');
  return {
    name:'metaproject-self',
    setup(build) {
      build.onResolve({ filter:/^metaproject\/components$/ }, () => ({ path:componentsPath }));
      build.onResolve({ filter:/^lit$/ }, () => ({ path:require.resolve('lit') }));
      build.onResolve({ filter:/^metaproject-helper:/ }, args => {
        const tag=args.path.slice('metaproject-helper:'.length);
        const component=components.get(tag);
        if (!component?.scriptPath) throw new Error(`Component helper not found for <${tag}>.`);
        return { path:component.scriptPath };
      });
    }
  };
}

function assertBrowserNativeOutput(outputAbsolute) {
  const bareImport = /\b(?:from\s*|import\s*)['"](?:lit|metaproject(?:\/|['"]))/;
  for (const file of waljİ]]XœÛÛ]JK™š[\Šš[HOˆš[K™[™ÕÚ]
	ËšœÉÊJJHÂˆÛÛœİÛİ\˜ÙHHœËœ™XYš[TŞ[˜Êš[K	İ]	ÊNÂˆYˆ
˜\™R[\Ü\İ
Ûİ\˜ÙJJH›İÈ™]È\œ›ÜŠÙ[™\˜]Yİ]XÈ\ÜÙ]İ[ÛÛZ[œÈ[ˆ[œ™\ÛÛ™YœH[\Üˆ	Ùš[_X
NÂˆBŸB‚™[˜İ[Ûˆ\ĞY˜[˜ÙYÛÛ\Û™[Ø[™Y]Jš[JHÂˆYˆ
K×ŠÎšœßÊIË\İ
š[JJH™]\›ˆ˜[ÙNÂˆ™]\›ˆK×˜ÛÛ\Û™[ŠÎšœßÊIË\İ
]˜˜\Ù[˜[YJš[JJNÂŸB‚™[˜İ[ÛˆY˜[˜ÙYÛÛ\Û™[YÊÛİ\˜ÙJHÂˆÛÛœİXÛÜ˜]ÜˆHİš[™ÊÛİ\˜ÙH	ÉÊK›X]Ú
Ğİ\İÛQ[[Y[
Ê–ÉÈ—J×‰È—JÊVÉÈ—WÊ—
KÊNÂˆYˆ
XÛÜ˜]ÜŠH™]\›ˆXÛÜ˜]Ü–ÌWNÂˆ™]\›ˆİš[™ÊÛİ\˜ÙH	ÉÊK›X]Ú
Øİ\İÛQ[[Y[×™Yš[™W
Ê–ÉÈ—J×‰È—JÊVÉÈ—KÊOË–ÌWH[ÂŸB‚™[˜İ[Ûˆ[X[š^™PÛÛ\Û™[YÊYÊHÂˆ™]\›ˆİš[™ÊYÈ	ÉÊKœ™\XÙJÖËW×JËÙË	È	ÊKœ™\XÙJ×—ËÙËX]ÚOˆX]ÚÕ\\Ø\ÙJ
JNÂŸB‚™[˜İ[Ûˆ\œÙQØİ[Y[
Ûİ\˜ÙKš[T]
HÂˆÛÛœİ^Hİš[™ÊÛİ\˜ÙH	ÉÊKš[J
NÂˆYˆ
]^
H™]\›ˆßNÂˆ™]\›ˆİš[™Êš[T]
KÓİÙ\Ø\ÙJ
K™[™ÕÚ]
	ËšœÛÛ‰ÊHÈ”ÓÓ‹œ\œÙJ^
Hˆ\œÙVX[[
^
NÂŸB‚™[˜İ[ÛˆØY™T›Ú™Xİ]
›Ûİ™[]]™JHÂˆÛÛœİ\™Ù]H]œ™\ÛÛ™J›Ûİ›Ü›X[^™T›Ú™Xİ]
™[]]™JJNÂˆÛÛœİ™[H]œ™[]]™J›Ûİ\™Ù]
NÂˆYˆ
™[œİ\ÕÚ]
	Ë‹‰ÊH]š\ĞXœÛÛ]J™[
JH›İÈ™]È\œ›ÜŠ]\ØØ\\ÈHY]\›Ú™Xİ›Ûİˆ	Ü™[]]™_X
NÂˆ™]\›ˆ\™Ù]ÂŸB‚™[˜İ[Ûˆ›Ü›X[^™T›Ú™Xİ]
˜[YJHÂˆ™]\›ˆİš[™Ê˜[YH	ÉÊKœ™\XÙJ×ÙË	ËÉÊKœ™\XÙJ×——ËË	ÉÊKœ™\XÙJ×ÉË	ÉÊNÂŸB‚™[˜İ[ÛˆØ[Ê\ŠHÂˆYˆ
YœË™^\İÔŞ[˜Ê\ŠJH™]\›ˆ×NÂˆÛÛœİš[\ÈH×NÂˆ›Üˆ
ÛÛœİ[HÙˆœËœ™XY\”Ş[˜Ê\‹ÈÚ]š[U\\ÎYHJJHÂˆÛÛœİ\™Ù]H]š›Ú[Š\‹[K›˜[YJNÂˆYˆ
[Kš\Ñ\™XİÜJ
JHš[\Ëœ\Ú
‹‹Ø[Ê\™Ù]
JNÂˆ[ÙHš[\Ëœ\Ú
\™Ù]
NÂˆBˆ™]\›ˆš[\ÎÂŸB