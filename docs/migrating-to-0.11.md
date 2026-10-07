# Migrating to Metaproject 0.11

Metaproject 0.11 freezes the first public package, CLI, build, and shared-runtime contracts. Projects created against earlier pre-release behavior should make the following changes before upgrading.

## API server configuration

Do not configure an `api_root` value in `metaproject.yaml`. API endpoints are part of the OpenAPI contract:

```yaml
servers:
  - url: /api
```

The generated default client uses the first resolved top-level OpenAPI server. Host applications can still replace a scope's client at runtime when they need authentication, tracing, CSRF, or another transport policy.

## Entity terminology

The public 0.11 model uses **Schema** terminology. Reusable data definitions live under `components.schemas`, and the CLI mutation command is:

```text
metaproject openapi upsert-schema --input schema.json
```

Update pre-0.11 project/documentation references that used Entity terminology for these reusable OpenAPI definitions.

## Static build entries

`index.js` is the host runtime. Load it once when components will be loaded individually:

```js
await import('/components/index.js');
await import('/components/user-list.js');
```

For a host that wants all of its local components, load `all.js` instead:

```html
<script type="module" src="/components/all.js"></script>
```

Individual `<tag>.js` files are independently loadable browser modules. They carry their component code and project operation metadata while reusing the host's shared runtime.

## Remote component scopes

Every independently distributed project should configure a unique `scope`:

```yaml
scope: billing
```

A remote component registers its operations/default client under that scope. The host loads one compatible runtime and imports the remote `<tag>.js`; it must not load the remote project's `index.js`.

Runtime compatibility is based on the versioned runtime ABI. The 0.11 contract uses ABI v1 (`Symbol.for('metaproject.runtime.v1')`), not exact npm package-version equality.

## Verify an upgraded project

```text
metaproject check
metaproject build
```

Then verify that the host loads either `all.js` for its complete local build or one `index.js` followed by the required individual component modules.
