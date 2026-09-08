# Getting started from scratch

This path is for a new application or a new API/UI surface where you control the contract.

## 1. Install and initialize

```bash
npm install --save-dev metaproject
npx metaproject init
```

This creates the Core-owned project foundation without imposing a frontend application framework:

```text
metaproject.yaml
openapi.yaml
components/
```

Generated output is created later under the configured `components.output` directory.

## 2. Configure the API root

```yaml
version: 1
name: Example
api_root: /api
openapi: openapi.yaml
components:
  source: components
  output: public/components
```

`api_root` is the base URL used by the generated default REST client. Your OpenAPI paths remain API-relative, for example `/users` and `/users/{id}`.

## 3. Model the API before the component

Define stable browser-facing operations in OpenAPI. For example:

```yaml
openapi: 3.1.0
info:
  title: Example API
  version: 0.0.0
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
      x-project-id: entity-user
      type: object
      properties:
        id: { type: integer }
        name: { type: string }
      required: [id, name]
```

For deterministic agent/tool updates you can use:

```bash
npx metaproject openapi upsert-entity --input entity.json
npx metaproject openapi upsert-operation --input operation.json
```

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

`metaproject check` validates the OpenAPI/component relationship model and reports missing operations, invalid component source, duplicate IDs, example problems, and related project diagnostics without producing build output.

## 6. Build

```bash
npx metaproject build
```

The default output is:

```text
public/components/
  index.js
  runtime.js
  api.js
  user-list.js
  manifest.json
  ...generated chunks
```

## 7. Use the Web Component

```html
<script type="module" src="/components/index.js"></script>

<user-list id="users"></user-list>
<script type="module">
  document.querySelector('#users').addEventListener('open', event => {
    console.log('Selected user', event.detail.resource);
  });
</script>
```

The component is a browser custom element. It can be hosted by your existing frontend framework or by plain HTML.

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
