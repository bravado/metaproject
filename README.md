# metaproject

Metaproject is a build-time/runtime toolkit for HTML-first Web Components backed by OpenAPI.

## Project shape

```text
metaproject.yaml
openapi.yaml
components/
public/components/       # generated
```

`metaproject.yaml` defines `api_root`, component paths, and Canvas layout.

## Lean data primitives

Components use declarative data primitives instead of calling an API facade directly.

```html
<data-source request="listUsers">
  <data-table></data-table>
</data-source>
```

`<data-source>` resolves the OpenAPI `operationId`, binds flat attributes to OpenAPI parameters, runs the request through the project client, caches GETs, deduplicates in-flight requests, subscribes to invalidation, and provides the resolved resource as context.

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

Use one `<data-source>` per query. For another query, add another data-source.

`<data-table>` automatically renders arrays/objects. Explicit table markup with a static `<template data-row>` is available when needed.

`<data-form>` automatically renders an object using OpenAPI schema metadata when available and runtime value types otherwise. It generates fields only; mutation controls are authored explicitly:

```html
<data-source request="getUser" id=${id}>
  <data-form>
    <button data-operation="updateUser">Save</button>
  </data-form>
</data-source>
```

`data-operation` resolves the referenced OpenAPI operation through the nearest `<data-source>`. Path/query/header parameters come from the source's flat attributes first and then from the current resource context. If the operation declares a request body, the current resource becomes that body. Inside `<data-form>`, that resource is the edited object. Successful mutations invalidate shared cached reads automatically.

The same primitive works for other operations:

```html
<button data-operation="deleteUser">Delete</button>
```

A source may override the project client explicitly:

```html
<data-source request="listInvoices" .client=${billingClient}>
  <data-table></data-table>
</data-source>
```

Otherwise the compiled application uses the default REST client created from `api_root`.

## Install / initialize

```bash
npm install --save-dev metaproject
npx metaproject init
```

## OpenAPI examples

Every operation with a response body should provide a representative success example so Canvas can render useful previews.

```bash
npx metaproject openapi check-examples
```

## Build

```bash
npx metaproject build
```

The build emits browser-native ESM under `public/components/`, including operation metadata, the default REST client runtime, compiled components, and a manifest.
