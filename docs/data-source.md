# Core data-source

`<data-source>` is the bridge between an OpenAPI operation and component resource context. It is intentionally small at the component level; request construction, caching, deduplication, clients, and invalidation live in the shared Core data runtime.

## Basic read

```html
<data-source request="listUsers">
  <data-table></data-table>
</data-source>
```

`request` must name a GET or HEAD OpenAPI `operationId`. The source resolves the operation from the configured runtime, gathers its parameters, executes it, and provides the response plus response schema to descendants.

A mutation is not put in `request`; use `data-operation` on the control that invokes it.

## Parameters

Operation parameters are authored as flat source attributes/properties. OpenAPI decides whether they belong to the path, query, or headers:

```html
<data-source
  request="listRows"
  db-name=${dbName}
  table-name=${tableName}
  limit="50"
>
  ...
</data-source>
```

For OpenAPI parameters `dbName`, `tableName`, and `limit`, Core maps `db-name` → `dbName` and `table-name` → `tableName`.

Parameter values are coerced using the OpenAPI parameter schema for common primitive types such as integer, number, boolean, and simple comma-separated arrays.

## `select`

Use `select` when an operation response wraps the resource a component actually needs:

```json
{
  "data": [{"id":1,"name":"Ada"}],
  "page": 1
}
```

```html
<data-source request="listUsers" select="data">
  <data-table></data-table>
</data-source>
```

`select` applies the same property path to both the response value and its response schema, so descendants see a matching resource/schema pair.

## Resource context

Each source provides its own resource context to descendants. This context is separate from the shared network cache.

For example, two sources may execute the same operation and share one HTTP request/cache entry while selecting or exposing their result independently.

Typical consumers are:

- `<data-table>` — consumes an array/object resource;
- `<data-form>` — consumes an object and provides an edited copy as nested resource context;
- `<data-label>` — reads a field from current resource context;
- row `data-action` / `data-operation` controls — receive the current row resource.

## Shared runtime and cache

Every data-source connected to the same configured Core runtime shares the GET/HEAD cache.

A query cache key is based on:

```text
client identity
+ operationId
+ resolved path parameters
+ query parameters
+ headers
```

Consequences:

- two matching sources reuse a completed cached value;
- two matching sources started at the same time deduplicate the in-flight request;
- different parameters create different cache entries;
- different client objects create different cache namespaces;
- resource context remains local to each source even when the HTTP value is shared.

The cache is in-memory and runtime-scoped; it is not persistent browser storage.

## Mutations

Put an OpenAPI mutation directly on the action element:

```html
<data-source request="getUser" id=${id}>
  <data-form>
    <button data-operation="updateUser">Save</button>
  </data-form>
</data-source>
```

The nearest data-source is the operation parameter scope. Core resolves mutation parameters in this order:

1. matching source attributes/properties;
2. current resource-context fields.

If the operation declares a request body, Core derives it from current resource context. Inside `data-form`, this is the edited object.

Top-level resource fields that are already declared OpenAPI path/query/header parameters are omitted from the automatically derived request body. For example, an `id` used in `/users/{id}` is not also sent as an editable body field unless the API contract models it there separately.

Before executing a body operation inside `data-form`, Core asks the form to report validity.

## Mutation invalidation

Successful mutations mark affected cached reads stale and notify mounted sources.

For PATCH, PUT, and DELETE of an item resource, Core invalidates the exact resource and its direct collection. For example:

```text
PATCH /users/2
```

invalidates reads for:

```text
/users/2
/users
```

without invalidating unrelated resources.

Other invalidation cases may be broader when Core cannot infer a safe resource relationship.

## Events and state

`<data-source>` exposes useful DOM state/events:

- `loading` attribute while an asynchronous read is pending;
- `error` attribute after a read/operation failure;
- `data-loaded` — `{ resource, schema }`;
- `data-error` — `{ error }`;
- `operation-complete` on the operation trigger after a successful mutation.

`data-loaded`, `data-error`, and `operation-complete` bubble and are composed where appropriate, so host applications can observe them without Core-specific callbacks.

## Refresh

A source exposes:

```js
element.refresh();
```

Current `refresh()` requests runtime invalidation and therefore may cause other mounted queries to reconsider their cached value. Prefer normal mutation-driven invalidation when possible.

## Default REST client

Static builds create a default REST client from `metaproject.yaml`:

```yaml
api_root: /api
```

The client:

- expands OpenAPI path parameters;
- adds query parameters;
- sends declared/request headers;
- serializes JSON request bodies;
- supports URL-encoded and native browser body types;
- reads JSON responses based on `Content-Type`;
- throws `RestClientError` for non-2xx HTTP responses.

## Custom client

A host can replace the project client globally after importing the generated runtime:

```js
import {
  configureMetaproject,
  createRestClient
} from '/components/index.js';

const client = createRestClient({
  baseUrl:'/api',
  headers:{ Authorization:'Bearer example-token' }
});

configureMetaproject({ client });
```

For dynamic authentication or application-specific request behavior, supply a custom `fetch` implementation to `createRestClient`, or a client object implementing `invoke(operation, args)`.

An individual source can exceptionally override the project client:

```html
<data-source request="listInvoices" .client=${billingClient}>
  ...
</data-source>
```

Use the shared project client by default so cache sharing and application configuration remain predictable.
