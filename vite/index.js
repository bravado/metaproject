import fs from 'node:fs';
import path from 'node:path';
import { compileComponentModule, parseComponentSource, tagFromComponentPath } from 'metaproject/compiler';

const REGISTRY_ID = '\0metaproject:components';
const COMPONENT_PREFIX = '\0metaproject:component:';
const SCRIPT_PREFIX = '\0metaproject:script:';

/**
 * Vite plugin that compiles Metaproject HTML components into ordinary Lit
 * custom elements for use by the final application.
 */
export function metaproject(options = {}) {
  let root = process.cwd();
  let componentsDir = '';
  let components = new Map();

  const refresh = () => {
    componentsDir = path.resolve(root, options.componentsDir || 'components');
    components = discoverComponents(componentsDir);
  };

  return {
    name: 'metaproject-components',
    enforce: 'pre',

    configResolved(config) {
      root = config.root || process.cwd();
      refresh();
    },

    resolveId(id, importer) {
      if (importer?.startsWith(SCRIPT_PREFIX) && id.startsWith('.')) {
        const tag = importer.slice(SCRIPT_PREFIX.length);
        const component = components.get(tag);
        if (component?.scriptPath) return path.resolve(path.dirname(component.scriptPath), id);
      }
      if (id === 'metaproject:components') return REGISTRY_ID;
      if (id.startsWith('metaproject:component/')) return `${COMPONENT_PREFIX}${id.slice('metaproject:component/'.length)}`;
      if (id.startsWith('metaproject:script/')) return `${SCRIPT_PREFIX}${id.slice('metaproject:script/'.length)}`;
      return null;
    },

    load(id) {
      if (id === REGISTRY_ID) {
        refresh();
        return [...components.keys()].sort().map(tag => `import 'metaproject:component/${tag}';`).join('\n');
      }
      if (id.startsWith(SCRIPT_PREFIX)) {
        const tag = id.slice(SCRIPT_PREFIX.length);
        refresh();
        const component = components.get(tag);
        if (!component?.scriptPath) return 'export default {};';
        return fs.readFileSync(component.scriptPath, 'utf8');
      }
      if (!id.startsWith(COMPONENT_PREFIX)) return null;
      const tag = id.slice(COMPONENT_PREFIX.length);
      refresh();
      const component = components.get(tag);
      if (!component) throw new Error(`Metaproject component <${tag}> was not found in ${componentsDir}.`);
      const source = fs.readFileSync(component.htmlPath, 'utf8');
      const css = component.stylePath && fs.existsSync(component.stylePath) ? fs.readFileSync(component.stylePath, 'utf8') : '';
      const scriptSource = component.scriptPath && fs.existsSync(component.scriptPath) ? fs.readFileSync(component.scriptPath, 'utf8') : '';
      const scriptImport = component.scriptPath ? `metaproject:script/${tag}` : null;
      const definition = parseComponentSource(source,{tag,path:component.htmlPath});
      const dependencyImports = definition.dependencies
        .filter(dependency => components.has(dependency))
        .map(dependency => `import 'metaproject:component/${dependency}';`)
        .join('\n');
      return `${dependencyImports}${dependencyImports ? '\n' : ''}${compileComponentModule({ tag, path:component.htmlPath, source, css, scriptImport, scriptSource })}`;
    },

    configureServer(server) {
      refresh();
      server.watcher.add(componentsDir);
      const reload = file => {
        if (!normalize(file).startsWith(normalize(componentsDir) + '/')) return;
        refresh();
        server.moduleGraph.invalidateAll();
        server.ws.send({ type:'full-reload' });
      };
      server.watcher.on('add', reload);
      server.watcher.on('change', reload);
      server.watcher.on('unlink', reload);
    }
  };
}

export function discoverComponents(componentsDir) {
  const out = new Map();
  if (!fs.existsSync(componentsDir)) return out;
  for (const htmlPath of walk(componentsDir).filter(file => path.basename(file) === 'component.html')) {
    const tag = tagFromComponentPath(htmlPath);
    const source = fs.readFileSync(htmlPath, 'utf8');
    const definition = parseComponentSource(source, { tag, path:htmlPath });
    if (out.has(tag)) throw new Error(`Duplicate Metaproject component tag <${tag}>.`);
    const dir = path.dirname(htmlPath);
    const scriptPath = ['component.js'].map(name => path.join(dir,name)).find(fs.existsSync);
    const stylePath = path.join(dir,'style.css');
    out.set(tag, {
      tag,
      title:definition.title,
      htmlPath,
      scriptPath:scriptPath || null,
      stylePath:fs.existsSync(stylePath) ? stylePath : null
    });
  }
  return out;
}

function walk(dir) {
  const files = [];
  for (const entry of fs.readdirSync(dir,{withFileTypes:true})) {
    const target = path.join(dir,entry.name);
    if (entry.isDirectory()) files.push(...walk(target));
    else files.push(target);
  }
  return files;
}
function normalize(value){return value.replace(/\\/g,'/');}

export default metaproject;
