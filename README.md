# Metaproject

Metaproject is the glue between your HTTP API and reusable Web Components.

```text
API / backend
    │
    │ OpenAPI 3.0/3.1 supported subset
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

## 5-minute first success

Install Metaproject as a development dependency, then initialize a project:

```bash
npm install --save-dev metaproject
npx metaproject init
```

Documentation examples use `npx metaproject ...` so the project-local executable is resolved without a global installation.

Model one browser-facing operation in `openapi.yaml`:

```yaml
openapi: 3.1.0
info:
  title: Example API
  version: 1.0.0
servers:
  - url: /api
paths:
  /users:
    get:
      operationId: listUsers
      x-project-id: op-list-users
      responses:
        '200':
          description: Users
          content:
            application/json:
              schema:
                type: array
                items:
                  $ref: '#/components/schemas/User'
              example:
                - { id: 1, name: Ada }
components:
  schemas:
    User:
      x-project-id: schema-user
      type: object
      properties:
        id: { type: integer }
        name: { type: string }
      required: [id, name]
```

Or, if the application already has a bundled OpenAPI document, import it instead:

```bash
npx metaproject import-openapi ./docs/openapi.yaml
```

Create `components/user-list/component.html`:

```html
<title>Users</title>

<data-source request="listUsers">
  <data-table>
    <button data-action="open-user">Open</button>
  </data-table>
</data-source>
```

Validate and build:

```bash
npx metaproject check
npx metaproject build
```

Embed the generated component in any HTML host:

```html
<script type="module" src="/components/all.js"></script>
<user-list id="users"></user-list>

<script type="module">
  document.querySelector('#users').addEventListener('open-user', event => {
    console.log(event.detail.resource);
  });
</script>
```

The repository's [vanilla example](examples/vanilla/) is this flow as a runnable local application with a deterministic API.

## Compatibility

| Boundary | 0.11.x policy |
| --- | --- |
| Node.js | Node **22.12.0+** on maintained Node release lines; CI covers 22.12.0, 24, and 26. |
| OpenAPI | OpenAPI 3.0/3.1 within Core's documented [supported subset](docs/openapi-support.md). |
| Browser output | Native ES modules targeting **ES2022**; requires modern Custom Elements, Shadow DOM, modules, and `fetch` support. |
| Vite | `metaproject/vite` is an optional experimental integration with Vite **6+**. Prefer static `npx metaproject build` output for framework-independent assets and remote-component distribution. |
| Shared runtime | 0.11 uses runtime ABI **v1**, identified by `Symbol.for('metaproject.runtime.v1')`; compatible host/component builds do not require exact npm-version equality. |

See [JavaScript API and compatibility](docs/public-api.md), [OpenAPI support](docs/openapi-support.md), and [shared runtime/remote components](docs/remote-components.md) for the detailed boundaries.

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

See the [canonical `metaproject.yaml` configuration reference](docs/configuration.md) for every supported field and default. `npx metaproject check` and `npx metaproject build` reject unknown top-level and nested configuration fields.

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

Initialize Metaproject, then import a bundled OpenAPI 3.0/3.1 YAML/JSON file or URL within Core's supported subset:

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

## Runnable examples

The repository includes small product examples that can be run directly:

- [Plain HTML / static build](examples/vanilla/) — local API, `all.js`, public property/attribute input, and a semantic `data-action` event.
- [Remote component](examples/remote-component/) — one host runtime plus a second-origin component/API registered under its own scope.
- [Existing application](examples/existing-app/) — keep existing server-rendered routes, OpenAPI, backend, and public web root while adding generated components.
- [Vite integration](examples/vite/) — compile component source inside an existing Vite-owned application bundle.

Start with the vanilla example if you want to see the complete contract → build → browser flow with no external service.

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

Metaproject implements a documented OpenAPI 3.0/3.1 subset. See the [OpenAPI support matrix](docs/openapi-support.md) before adopting an existing contract; `npx metaproject check` reports unsupported and partially supported constructs.

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

Core exposes its project/OpenAPI indexers through the experimental JavaScript tooling API so other tools can reuse consistent diagnostics.

## JavaScript API

Metaproject intentionally does not provide a root `import 'metaproject'` entry. Use the documented subpath exports so browser runtime code and Node tooling stay explicit.

The runtime entry points `metaproject/components` and `metaproject/data-source` are stable for the 0.11.x line. Compiler, Vite, OpenAPI, and project-model tooling are public but experimental. See the [JavaScript API and compatibility policy](docs/public-api.md).

## Build

```bash
npx metaproject build
```

The build emits a shared host runtime and independently loadable browser-native component bundles:

```text
index.js          # host runtime: load once, registers base elements
api.js            # operation metadata
<component>.js    # independently loadable component, without Core/Lit runtime
all.js            # convenience entry: host runtime + all local components
manifest.json     # component metadata and API scope
```

The default REST client uses the first resolved OpenAPI server. A host can replace it with `configureMetaproject({client})` when authentication, CSRF, tracing, application-specific request policy, or a different deployment endpoint requires a custom transport.

Use `all.js` to load the runtime and all local components, or load `index.js` once and import individual components (including remote components) afterward:

```html
<script type="module">
  await import('/components/index.js');
  await import('/components/user-list.js');
  await import('https://billing.example.com/components/invoice-list.js');
</script>
<user-list></user-list>
<invoice-list></invoice-list>
```

Every independently hosted project must set a unique `scope` in its `metaproject.yaml` (for example `scope: billing`). Distinct component tag names and a compatible runtime ABI are required; exact Metaproject npm package-version equality is not. See [Shared runtime and remote components](docs/remote-components.md).

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
- [`metaproject.yaml` configuration](docs/configuration.md)
- [OpenAPI support matrix](docs/openapi-support.md)
- [JavaScript API and compatibility](docs/public-api.md)
- [Getting started from scratch](docs/getting-started.md)
- [Adopting an existing application](docs/adopting-existing-application.md)
- [Core data-source](docs/data-source.md)
- [Calling OpenAPI operations from the CLI](docs/api-cli.md)
- [CLI reference](docs/cli-reference.md)
- [Using generated components](docs/using-components.md)
- [Shared runtime and remote components](docs/remote-components.md)
- [OpenAPI → component workflow](docs/openapi-component-workflow.md)
- [Runnable product examples](examples/)
- [Release process and npm trusted publishing](docs/releasing.md)

## License, contributing, and security

Metaproject Core is distributed under the [MIT License](LICENSE). Review the
[0.11 release notes](CHANGELOG.md), read the
[contributing guide](CONTRIBUTING.md) before proposing changes, and follow the
[security policy](SECURITY.md) to report vulnerabilities privately.
