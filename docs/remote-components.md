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

**Do not load another project's `index.js`.** The host should install exactly one runtime, and remote projects should distribute their individual component files only. Each standalone bundle looks up the runtime ABI it requires. The current ABI is **v1**, identified solely by `Symbol.for('metaproject.runtime.v1')`; if that symbol is not installed, the component fails with an explicit compatibility error before registering itself.

Runtime ABI compatibility is intentionally independent from the npm package version. A component built by one Metaproject package version may run against a host built by another package version as long as both implement the same runtime ABI. The producer package version is recorded for diagnostics, not used as an equality requirement.

## Runtime ABI contract

The runtime ABI is the JavaScript object shared between independently built host and component bundles. ABI v1 exposes the Lit primitives, component/data-source helpers, scope registration, tag registration, and runtime configuration consumed by standalone bundles. The versioned global symbol is the compatibility identifier; the runtime object does not carry a second version field.

Increment the ABI and use a new symbol such as `metaproject.runtime.v2` only for an incompatible runtime-boundary change, for example removing or renaming a shared export, changing the call contract of a shared function, or changing behavior in a way an existing standalone bundle cannot safely use. Additive runtime fields and compatible implementation fixes do not require a new ABI.

A new npm package release does **not** imply a new runtime ABI. Conversely, a new ABI may be introduced before 1.0 if the shared runtime contract must break.

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

Scope names must be lowercase identifiers containing letters, numbers, dots, underscores, or hyphens. The default is `default` for backwards compatibility with a single project. For separate projects, explicitly choose unique scope names and distinct custom-element tags; loading the same scope with different operation definitions, the same component tag from different scopes, or a tag already defined outside Metaproject is an error.

## Distribution files

Each `<tag>.js` is a standalone JavaScript module and does not require sibling `runtime.js`, `api.js`, or chunk files. Component dependencies from the same project are included in the bundle. The generated `manifest.json` identifies its scope, component entry points, runtime ABI, and producer version.

### Manifest compatibility

The top-level `version` field is the **manifest schema version**. Schema version 1 is the initial public contract. The compatibility fields are:

- `generatedBy` and `generatedByVersion` — producer identity and package/build version;
- `runtime` — host runtime filename;
- `runtimeAbi` — required shared-runtime ABI; generated component code derives the matching symbol as `metaproject.runtime.vN`;
- `scope` — API/runtime scope for this build;
- `components.<tag>.file`, `standalone`, and `scope` — component loading metadata.

Consumers may treat additional descriptive component fields such as titles, properties, actions, and dependencies as metadata that can grow additively within schema version 1. Removing a compatibility field or changing its meaning requires a new manifest schema version.

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
See the [remote component example](../examples/remote-component/) for a runnable two-origin setup with one host runtime, a unique remote scope, CORS, and a remote API.
