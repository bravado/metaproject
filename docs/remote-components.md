# Shared runtime and remote components

Metaproject generates one **host runtime** (`index.js`) and separate, individually loadable **component bundles** (`<tag>.js`). A component bundle includes its compiled component, any local component dependencies, helper source, and OpenAPI operation metadata. It does **not** include a second copy of Metaproject Core or Lit.

## Host application

Load the host's `index.js` before any remote component. Using `await import()` makes the ordering explicit:

```html
<script type="module">
  const mp = await import('/components/index.js');
  await import('/components/user-list.js');
  await import('https://billing.example.com/components/invoice-list.js');

  // Optional: override billing's client after its component registers its scope.
  mp.configureMetaproject({
    scope:'billing',
    client:mp.createRestClient({
      baseUrl:'https://api.billing.example.com',
      headers:{Authorization:'Bearer ' + token}
    })
  });
</script>

<user-list></user-list>
<invoice-list></invoice-list>
```

For an application that only uses its own components, `<script type="module" src="/components/all.js"></script>` remains the simplest option.

**Do not load another project's `index.js`.** The host should install exactly one runtime, and remote projects should distribute their individual component files only. A remote component checks for the host runtime and reports an error if it is missing. Make sure the host runtime implements the same `metaproject.runtime.v1` contract expected by the remote component; deploy compatible Core versions together.

## Remote project

Assign a unique API scope in each separately distributed project's `metaproject.yaml`:

```yaml
version: 1
name: Billing
scope: billing
openapi: openapi.yaml
components:
  source: components
  output: public/components
```

Run `npx metaproject build` on the remote project and serve `public/components/invoice-list.js` from its own domain. Every component registers its own OpenAPI operations and default API server under its scope; the host's other scopes are unaffected, even if the different API contracts use the same `operationId`.

The generated component exposes its scope to nested `<data-source>` elements automatically. For manually authored `<data-source>` instances, set the `scope` attribute explicitly when required.

Scope names must be lowercase identifiers containing letters, numbers, dots, underscores, or hyphens. The default is `default` for backwards compatibility with a single project. For separate projects, explicitly choose unique scope names and distinct custom-element tags; loading the same scope with different operation definitions, or the same component tag from different scopes, is an error.

## Distribution files

Each `<tag>.js` is a standalone JavaScript module and does not require sibling `runtime.js`, `api.js`, or chunk files. Component dependencies from the same project are included in the bundle. The generated `manifest.json` identifies its scope and component entry points.

The `index.js` runtime is larger because it includes Lit and the Metaproject data primitives. It is intended to be loaded once by the host, not separately for each library.

The `all.js` convenience module and `runtime.js` compatibility re-export use relative imports and must be deployed alongside the host's generated build output.

## HTTP, security, and trust

The component's JavaScript origin is independent of its configured OpenAPI server. A relative server such as `/api` resolves against the **host page's origin**. Use absolute HTTPS OpenAPI servers when a remote component should use its own domain's API.

Both the remote JavaScript server and remote HTTP API must permit the host page's origin under their respective CORS policies. Remote JS must be served with a JavaScript MIME type. Authentication and CSP must also allow the intended requests and modules.

**Remote components execute JavaScript with the host application's privileges.** Only load components from trusted and appropriately versioned publishers; use pinned asset URLs and suitable integrity/deployment controls.

## API overrides

After a remote component has registered its scope, the host may replace that scope's client:

```js
mp.configureMetaproject({
  scope:'billing',
  client:mp.createRestClient({baseUrl:'https://staging.billing.example.com'})
});
```

The override invalidates only that scope's cache. Other components retain their API clients, operation IDs, and cache entries. Data loaded within a generated component is isolated by its own scope unless a source explicitly sets another scope.
