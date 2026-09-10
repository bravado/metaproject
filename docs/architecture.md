# Architecture

Metaproject is the glue between an HTTP API contract and reusable Web Components.

```text
backend / API
      │
      │ OpenAPI 3.x
      ▼
Metaproject Core
  ├─ API model + validation
  ├─ shared data runtime
  ├─ HTML-first component compiler
  └─ static browser build
      │
      ▼
Web Components
      │
      ├─ plain HTML / JavaScript
      ├─ Lit
      ├─ React/Vue/Svelte wrappers
      ├─ server-rendered applications
      └─ Metaproject Canvas (optional development tooling)
```

Core does not define application routing or page layout. It turns a stable API contract plus small component sources into browser-native custom elements that can be embedded in any application.

## Canonical project model

A minimal project is:

```text
metaproject.yaml
openapi.yaml
components/
public/components/       # generated, do not edit
```

`metaproject.yaml` describes the contract location and source/output paths:

```yaml
version: 1
name: Example
openapi: openapi.yaml
components:
  source: components
  output: public/components
```

API endpoint and authentication metadata belong to OpenAPI itself:

```yaml
servers:
  - url: /api
  - url: https://staging.example.test/api

components:
  securitySchemes:
    bearer:
      type: http
      scheme: bearer

security:
  - bearer: []
```

The generated default REST client uses the first resolved top-level OpenAPI server. Canvas can select any declared server for development/testing. Credentials never belong in either project file; hosts and development tools supply them at runtime.

The OpenAPI path and component source/output directories are configurable. Canvas may store optional `canvas:` metadata in `metaproject.yaml`, but Core does not require it.

## OpenAPI is the API boundary

Components never encode HTTP methods or URLs directly. They reference stable `operationId` values:

```html
<data-source request="listUsers">
  <data-table></data-table>
</data-source>
```

and:

```html
<button data-operation="updateUser">Save</button>
```

OpenAPI owns:

- HTTP method and path;
- top-level API servers and server variables;
- parameter location and schema;
- request-body schema;
- response schema;
- security schemes and operation/root security requirements;
- stable operation identifiers used by Metaproject components;
- representative development examples.

This keeps components portable when backend routing implementations or server frameworks change. The same component can point at a different deployment by changing the runtime client/server rather than component source.

## Resource context is the component data model

`<data-source>` resolves an operation, executes it through the shared runtime, and exposes the result plus its response schema as resource context to descendants. Data-aware primitives consume that context:

```text
<data-source>
      │ resource + schema
      ├─ <data-table>
      │      └─ row action → row resource context
      ├─ <data-form>
      │      └─ edited object resource context
      └─ <data-label>
```

Components can nest or use multiple independent sources. The HTTP/cache layer is shared even though each source provides its own selected resource context.

See [data-source.md](data-source.md).

## Application behavior is expressed as events

Reusable components should emit semantic intent instead of owning host navigation:

```html
<button data-action="open">Open</button>
```

The resulting `open` event is a normal bubbling/composed DOM CustomEvent. The host decides what `open` means:

```js
users.addEventListener('open', event => showUser(event.detail.resource));
```

This is what allows the same component to work in multiple applications and in optional Canvas compositions.

API mutations are distinct from application intent. `data-operation` invokes OpenAPI; `data-action` emits semantic UI/application events.

## Build boundary

`npx metaproject build` produces browser-native ESM in the configured component output directory. The output includes:

- operation metadata (`api.js`);
- the default REST runtime (`runtime.js`) configured to the first OpenAPI server;
- one generated module per component;
- an `index.js` entry point that registers all generated custom elements;
- `manifest.json` with component metadata.

The generated output contains no Canvas runtime dependency. A host application can replace the default client for authentication, session integration, tracing, endpoint selection, or other transport policy without changing component source.

See [using-components.md](using-components.md).

## Development tools

Core also owns the project-development model so every tool works against the same rules:

- project initialization;
- local or remote OpenAPI import;
- deterministic OpenAPI operation/schema mutation;
- OpenAPI example validation;
- OpenAPI server and security interpretation;
- API/component project indexing and diagnostics;
- project contract validation with `metaproject check`;
- static component build;
- agent skills for new projects, existing-code analysis, OpenAPI adoption, and component generation.

Canvas consumes these Core facilities; it does not define them.
