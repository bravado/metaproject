# Metaproject

Metaproject is the glue between your HTTP API and reusable Web Components.

```text
API / backend
    │
    │ OpenAPI 3.x
    ▼
Metaproject Core
    │
    ├─ shared data-source runtime
    ├─ HTML-first component compiler
    ├─ API/component validation and tooling
    └─ static browser build
    │
    ▼
Web Components usable by any application
```

The generated components are ordinary browser custom elements. Use them in plain HTML/JavaScript, Lit, framework wrappers, or server-rendered applications.

## Project shape

A minimal project is:

```text
metaproject.yaml
openapi.yaml
components/
public/components/       # generated
```

Default `metaproject.yaml`:

```yaml
version: 1
name: Example
openapi: openapi.yaml
components:
  source: components
  output: public/components
```

API endpoints belong to OpenAPI, not `metaproject.yaml`:

```yaml
servers:
  - url: /api
  - url: https://staging.example.test/api
```

The generated default runtime uses the first OpenAPI server. Development tools can expose all declared servers as selectable HTTP sources. OpenAPI server variables are supported through their declared defaults/values.

The OpenAPI path and component directories are configurable.

## Choose your starting point

### New project

```bash
npm install --save-dev metaproject
npx metaproject init
```

Then design the browser-facing API contract and create components. See [Getting started from scratch](docs/getting-started.md) or give your coding agent:

```text
node_modules/metaproject/skills/project-bootstrap/SKILL.md
```

### Existing application with an OpenAPI contract

Initialize Metaproject, then import a bundled OpenAPI 3.x YAML/JSON file or URL:

```bash
npx metaproject init
npx metaproject import-openapi ./docs/openapi.yaml
# or
npx metaproject import-openapi https://example.test/openapi.json
```

For an existing multi-file local specification, you can keep it in place and configure:

```yaml
openapi: docs/api/openapi.yaml
```

See [Adopting an existing application](docs/adopting-existing-application.md) and `skills/openapi-import/SKILL.md`.

### Existing application without a sufficient API spec

Metaproject ships an agent workflow for static analysis of routes/controllers, validation, serializers, browser calls, templates, and relevant domain types:

```text
node_modules/metaproject/skills/application-analysis/SKILL.md
```

The skill models the browser-facing HTTP capabilities in OpenAPI first, then hands off to component creation. It does not attempt to model every source-code method.

## Core component model

A read component can be very small:

```html
<title>Users</title>

<data-source request="listUsers">
  <data-table>
    <button data-action="open">Open</button>
  </data-table>
</data-source>
```

`request="listUsers"` refers to an OpenAPI `operationId`; the component does not encode a URL or HTTP method.

`data-action="open"` emits a normal semantic CustomEvent. The host application decides what `open` means:

```js
document.querySelector('user-list').addEventListener('open', event => {
  showUser(event.detail.resource);
});
```

A mutation stays tied to the API contract:

```html
<data-source request="getUser" id=${id}>
  <data-form>
    <button data-operation="updateUser">Save</button>
  </data-form>
</data-source>
```

This separation is intentional:

```text
data-action      → application intent / host behavior
data-operation   → OpenAPI operation
data-source      → OpenAPI read + resource context
```

## `<data-source>`

`<data-source>` is Core's data boundary. It:

- resolves a GET/HEAD OpenAPI `operationId`;
- maps flat HTML attributes/properties to OpenAPI path/query/header parameters;
- executes through the configured client;
- shares an in-memory GET/HEAD cache with all other sources in the same runtime;
- deduplicates identical in-flight requests;
- selects nested response data/schema with `select="..."`;
- provides resource + schema context to `data-table`, `data-form`, `data-label`, and nested controls;
- coordinates mutation parameters/request bodies through `data-operation`;
- invalidates affected cached reads after successful mutations.

Example:

```html
<data-source
  request="listRows"
  db-name=${dbName}
  table-name=${tableName}
  select="data"
>
  <data-table></data-table>
</data-source>
```

All matching sources share the HTTP/cache entry while each source keeps its own resource context. See the full [Core data-source documentation](docs/data-source.md).

## OpenAPI servers and authentication

OpenAPI is also the source of truth for API server and security metadata. Core exports browser-safe helpers for:

- ordered top-level `servers` and server variables;
- `components.securitySchemes` discovery;
- root and operation-level `security` requirements;
- OpenAPI OR/AND security requirement semantics;
- API keys in headers, query parameters, or cookies;
- HTTP authentication including Basic, Bearer, and other declared HTTP schemes;
- OAuth 2.0 and OpenID Connect access tokens;
- mutual TLS transport metadata.

Authentication credentials are runtime data and must not be committed to `openapi.yaml` or `metaproject.yaml`. A host application can supply its own configured client. OAuth/OpenID Connect registration belongs to provider/application configuration rather than OpenAPI; supply acquired tokens securely at runtime.

## Public Web Component contract

Declare inputs with `<component-property>`:

```html
<component-property
  name="dbName"
  type="string"
  required
  example="app"
></component-property>
```

Primitive camelCase properties compile to predictable kebab-case HTML attributes:

```html
<db-table-list db-name="app"></db-table-list>
```

They can also be assigned as JavaScript properties:

```js
component.dbName='app';
```

Use semantic DOM events for outputs. This makes generated elements portable across host applications.

See [Using generated components](docs/using-components.md).

## OpenAPI tooling

Metaproject keeps the API contract deterministic and useful for development previews:

```bash
# validate representative response examples
npx metaproject openapi check-examples

# create/update modeled resources from JSON input
npx metaproject openapi upsert-schema --input schema.json
npx metaproject openapi upsert-operation --input operation.json

# import an existing bundled YAML/JSON contract
npx metaproject import-openapi SOURCE
```

Every modeled operation should have a stable `operationId` and `x-project-id`; reusable schemas should have stable `x-project-id` values. Operations with response bodies should have small representative success examples.

## Call OpenAPI operations from the CLI

The CLI can execute modeled operations directly by `operationId` using the same operation metadata and REST client semantics as generated components:

```bash
npx metaproject api list
npx metaproject api show getUser
npx metaproject api call getUser --id 123
npx metaproject api call createUser --body @user.json
```

Path, query, and header parameters become `--PARAM` flags. Use `-H` for arbitrary headers and `--server` to override the first OpenAPI server. Relative OpenAPI server URLs require an absolute `--server` value when called from the CLI.

See [Calling OpenAPI operations from the CLI](docs/api-cli.md).

## Validate the complete project

```bash
npx metaproject check
```

`check` validates the shared project model without building assets: OpenAPI resources, examples, component parsing, operation references, duplicate IDs/tags, and related contract diagnostics.

Core exports its project/OpenAPI indexers so other tools can reuse consistent diagnostics.

## Build

```bash
npx metaproject build
```

The build emits browser-native ESM under the configured output directory, including:

```text
index.js          # import once; registers generated custom elements
runtime.js        # default REST runtime/configuration
api.js            # operation metadata
<component>.js    # generated Web Components
manifest.json     # component metadata
_chunks/...       # shared generated chunks when needed
```

The default REST client uses the first resolved OpenAPI server. A host can replace it with `configureMetaproject({client})` when authentication, CSRF, tracing, application-specific request policy, or a different deployment endpoint requires a custom transport.

Use the output directly from an application:

```html
<script type="module" src="/components/index.js"></script>
<user-list></user-list>
```

Node.js/Metaproject is a development/build dependency; the host application does not need a Metaproject server at runtime.

## Agent skills

Core ships focused skills instead of one monolithic workflow:

- `skills/project-bootstrap/SKILL.md` — design a new project/API from scratch;
- `skills/application-analysis/SKILL.md` — analyze an existing codebase and write/update its browser API contract;
- `skills/openapi-import/SKILL.md` — adopt an existing OpenAPI contract;
- `skills/component-creator/SKILL.md` — generate the smallest useful reusable Web Components from modeled operations;
- `skills/component-authoring/SKILL.md` — edit HTML-first components and Core primitives directly.

`npx metaproject init` can add a bounded `AGENTS.md` section that routes coding agents to the right workflow.

## Documentation

- [Architecture](docs/architecture.md)
- [Getting started from scratch](docs/getting-started.md)
- [Adopting an existing application](docs/adopting-existing-application.md)
- [Core data-source](docs/data-source.md)
- [Calling OpenAPI operations from the CLI](docs/api-cli.md)
- [Using generated components](docs/using-components.md)
