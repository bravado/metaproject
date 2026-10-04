# Add Metaproject to an existing application

Metaproject does not require rewriting the host application. Add it as a development/build layer that models the browser-facing API and emits reusable Web Components into a directory your application already serves.

## Install

```bash
npm install --save-dev metaproject
npx metaproject init
```

`init` is conservative: it creates missing Metaproject files/directories and does not overwrite existing canonical files. It can also add a bounded Metaproject section to `AGENTS.md` so coding agents know which workflow to follow.

A typical PHP/Rails/Django/etc. application can keep all existing application source where it is:

```text
app/ or src/               # existing application
public/                    # existing web root
metaproject.yaml
openapi.yaml               # or another configured OpenAPI path
components/                # Metaproject component source
public/components/         # generated browser assets
```

## Choose the adoption path

### Existing OpenAPI contract

If the application already has a useful bundled OpenAPI 3.x document, import it:

```bash
npx metaproject import-openapi ./docs/openapi.yaml
```

or:

```bash
npx metaproject import-openapi https://example.test/openapi.json
```

This copies and normalizes it into Metaproject's `openapi.yaml`.

If the existing contract is intentionally multi-file and uses external `$ref` files, you can keep it in place instead:

```yaml
openapi: docs/api/openapi.yaml
```

Core resolves local external references during build/check. Add the required examples/Metaproject IDs to that contract or to a Metaproject-owned copy according to your repository ownership policy.

Agent skill:

```text
node_modules/metaproject/skills/openapi-import/SKILL.md
```

### Existing code, no adequate OpenAPI contract

Have the coding agent analyze the relevant application surface:

```text
node_modules/metaproject/skills/application-analysis/SKILL.md
```

The skill inspects routes/controllers/handlers, request validation, serializers/DTOs, existing browser fetch calls, templates, and relevant domain types. It models only browser-facing HTTP capabilities rather than every source-code method.

The intended flow is:

```text
existing routes + handlers + serializers
              ↓ static analysis
       browser API contract
              ↓
          OpenAPI 3.x
              ↓
  Metaproject Web Components
```

### Existing OpenAPI, but incomplete

Import/use the existing contract first, then use the application-analysis skill only for missing or stale operations. Avoid reverse-engineering endpoints already described accurately.

## Configure output for the host

Point generated assets at a directory your application already publishes:

```yaml
components:
  source: components
  output: public/components
```

The source path is also configurable. For example:

```yaml
components:
  source: frontend/metaproject
  output: public/assets/components
```

Core's compiler/project index uses the configured source directory; component tags are inferred from each component directory, not from a hardcoded `components/` path.

## Build into the existing application

```bash
npx metaproject check
npx metaproject build
```

Then include the generated browser entry point in the application layout:

```html
<script type="module" src="/components/index.js"></script>
```

and use generated custom elements in existing templates/pages:

```html
<user-list id="users"></user-list>
```

The host owns application behavior:

```js
users.addEventListener('open', event => {
  location.href=`/users/${event.detail.resource.id}`;
});
```

A different host can use the same component with a modal, SPA router, side panel, or selection callback instead.

## Authentication and HTTP integration

If the default OpenAPI server is `/api`, the generated client can use same-origin cookies.

For different roots, static headers, custom authentication, CSRF behavior, observability, or request middleware, configure the generated runtime from the host. See [using-components.md](using-components.md) and [data-source.md](data-source.md).

## CI

A useful existing-project CI sequence is:

```bash
npm ci
npx metaproject check
npx metaproject build
```

You may also make the build part of the application's normal asset build/deployment. Generated files should generally be treated as build output rather than hand-maintained source.

