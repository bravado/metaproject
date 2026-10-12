# Getting started from scratch

This path is for a new application or a new API/UI surface where you control the contract.

## 1. Install and initialize

```bash
npm install --save-dev metaproject
npx metaproject init
```

These docs use `npx metaproject ...` so the project-local executable is resolved without a global installation.

This creates the Core-owned project foundation without imposing a frontend application framework:

```text
metaproject.yaml
openapi.yaml
components/
```

Generated output is created later under the configured `components.output` directory.

## 2. Configure API servers in OpenAPI

`metaproject.yaml` identifies the contract and component directories:

```yaml
version: 1
name: Example
openapi: openapi.yaml
components:
  source: components
  output: public/components
```

The API endpoint belongs to `openapi.yaml`:

```yaml
openapi: 3.1.0
info:
  title: Example API
  version: 0.0.0
servers:
  - url: /api
  - url: https://staging.example.test/api
```

The generated default REST runtime uses the first OpenAPI server. Tools may expose all top-level servers as alternate development targets. OpenAPI server variables can be used normally:

```yaml
servers:
  - url: https://{environment}.example.test/api
    variables:
      environment:
        default: staging
        enum: [staging, production]
```

## 3. Model the API before the component

Define stable browser-facing operations in OpenAPI. For example:

```yaml
openapi: 3.1.0
info:
  title: Example API
  version: 0.0.0
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
              examples:
                default:
                  value:
                    - { id: 1, name: Ada }
                    - { id: 2, name: Grace }
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

For deterministic agent/tool updates you can use:

```bash
npx metaproject openapi upsert-schema --input schema.json
npx metaproject openapi upsert-operation --input operation.json
```

If the API requires authentication, describe it with standard OpenAPI `components.securitySchemes` and `security`. Keep credentials out of the specification; they are runtime/application configuration.

## 4. Create a component

Create:

```text
components/user-list/component.html
```

with:

```html
<title>Users</title>

<data-source request="listUsers">
  <data-table>
    <button data-action="open">Open</button>
  </data-table>
</data-source>
```

The component does not know what route/page/modal should open. It emits the semantic `open` event with the selected row as `event.detail.resource`.

## 5. Validate

```bash
npx metaproject openapi check-examples
npx metaproject check
```

`npx metaproject check` validates the OpenAPI/component relationship model and reports missing operations, invalid component source, duplicate IDs, example problems, and related project diagnostics without producing build output.

## 6. Build

```bash
npx metaproject build
```

The default output is:

```text
public/components/
  index.js       # shared host runtime
  all.js         # shared runtime + all local components
  api.js
  user-list.js
  manifest.json
```

## 7. Use the Web Component

```html
<script type="module" src="/components/all.js"></script>

<user-list id="users"></user-list>
<script type="module">
  document.querySelector('#users').addEventListener('open', event => {
    console.log('Selected user', event.detail.resource);
  });
</script>
```

The component is a browser custom element. It can be hosted by your existing frontend framework or by plain HTML. Host applications can replace the generated default REST client with `configureMetaproject({client})` when they need application-specific authentication/session behavior.

## Agent workflow

For an agent-driven new project, use:

```text
node_modules/metaproject/skills/project-bootstrap/SKILL.md
```

That skill designs the initial OpenAPI contract, validates examples, then hands component creation to the component-creator skill.

Continue with:

- [architecture.md](architecture.md)
- [data-source.md](data-source.md)
- [using-components.md](using-components.md)
For a complete runnable version of this flow, see the [plain HTML example](../examples/vanilla/).
