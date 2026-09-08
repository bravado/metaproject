import fs from 'node:fs';
import path from 'node:path';
import { createDefaultMetaprojectSource, createDefaultOpenApiSource } from '../project/index.js';

export const AGENTS_MARKER_START = '<!-- metaproject:start -->';
export const AGENTS_MARKER_END = '<!-- metaproject:end -->';

export function initProject({ root = process.cwd(), name, agents = true } = {}) {
  root = path.resolve(root);
  fs.mkdirSync(root, { recursive:true });

  const projectName = name || detectProjectName(root);
  const created = [];
  const preserved = [];

  writeIfMissing(root, 'metaproject.yaml', createDefaultMetaprojectSource({ name:projectName }), created, preserved);
  writeIfMissing(root, 'openapi.yaml', createDefaultOpenApiSource({ title:`${projectName} API` }), created, preserved);

  const componentsDir = safeProjectPath(root, 'components');
  if (!fs.existsSync(componentsDir)) {
    fs.mkdirSync(componentsDir, { recursive:true });
    created.push('components/');
  }

  let agentsResult = null;
  if (agents) agentsResult = ensureAgentsInstructions(root);

  return {
    root,
    name:projectName,
    created,
    preserved,
    agents:agentsResult
  };
}

export function detectProjectName(root) {
  const packageJson = readJson(path.join(root, 'package.json'));
  if (packageJson?.name) return humanizePackageName(packageJson.name);

  const composerJson = readJson(path.join(root, 'composer.json'));
  if (composerJson?.name) return humanizePackageName(composerJson.name);

  return humanizePackageName(path.basename(root)) || 'Metaproject';
}

export function ensureAgentsInstructions(root) {
  const target = path.join(root, 'AGENTS.md');
  const previous = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : '';
  const block = `${AGENTS_MARKER_START}
## Metaproject

Metaproject is the OpenAPI-to-Web-Components layer in this repository. Canonical source is \`metaproject.yaml\`, the configured OpenAPI document, and the configured component source directory. Never edit generated component output manually.

Choose the workflow that matches the task:

- New project/API design: \`node_modules/metaproject/skills/project-bootstrap/SKILL.md\`
- Existing codebase without a complete OpenAPI contract: \`node_modules/metaproject/skills/application-analysis/SKILL.md\`
- Existing OpenAPI/Swagger contract to adopt: \`node_modules/metaproject/skills/openapi-import/SKILL.md\`
- Generate components from an already-modeled API: \`node_modules/metaproject/skills/component-creator/SKILL.md\`
- Edit component source directly: \`node_modules/metaproject/skills/component-authoring/SKILL.md\`

Keep OpenAPI success examples small and representative. Prefer semantic \`data-action\` events so generated Web Components remain reusable in any host application. Run \`npx metaproject check\` before \`npx metaproject build\`.
${AGENTS_MARKER_END}
`;

  const start = previous.indexOf(AGENTS_MARKER_START);
  const end = previous.indexOf(AGENTS_MARKER_END);
  if (start >= 0 && end >= start) {
    const endOffset = end + AGENTS_MARKER_END.length;
    const suffix = previous.slice(endOffset).replace(/^\n?/, '');
    const next = `${previous.slice(0,start)}${block}${suffix}`;
    if (next === previous) return { path:'AGENTS.md', changed:false };
    fs.writeFileSync(target, next);
    return { path:'AGENTS.md', changed:true, created:false, updated:true };
  }

  const separator = previous && !previous.endsWith('\n') ? '\n\n' : previous ? '\n' : '';
  fs.writeFileSync(target, `${previous}${separator}${block}`);
  return { path:'AGENTS.md', changed:true, created:!previous };
}

function writeIfMissing(root, relative, source, created, preserved) {
  const absolute = safeProjectPath(root, relative);
  if (fs.existsSync(absolute)) {
    preserved.push(relative);
    return false;
  }
  fs.mkdirSync(path.dirname(absolute), { recursive:true });
  fs.writeFileSync(absolute, source);
  created.push(relative);
  return true;
}

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { return null; }
}

function humanizePackageName(value) {
  const tail = String(value || '').split('/').filter(Boolean).at(-1) || '';
  if (!tail) return '';
  if (/^[a-z]{2,4}$/i.test(tail)) return tail.toUpperCase();
  return tail.split(/[-_.]+/).filter(Boolean).map(word => word[0]?.toUpperCase() + word.slice(1)).join(' ');
}

function safeProjectPath(root, relative) {
  const target = path.resolve(root, String(relative || ''));
  const rel = path.relative(root, target);
  if (rel.startsWith('..') || path.isAbsolute(rel)) throw new Error(`Path escapes the Metaproject root: ${relative}`);
  return target;
}
