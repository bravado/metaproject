---
name: metaproject-component-authoring
description: Author reusable Metaproject Web Components using declarative data-source requests, automatic data-table/data-form rendering, semantic actions, and direct data-operation actions.
---

# Metaproject Component Authoring

Canonical component source lives in the configured `components.source` directory. Generated output is build output and must not be edited.

Read `docs/data-source.md` and `docs/using-components.md` when runtime/host behavior matters.

## Core primitives

- `<data-source>` executes one OpenAPI GET/HEAD operation and provides its result as resource context.
- `<data-table>` consumes resource context and renders arrays/objects. Direct `data-action`/`data-operation` children become row actions.
- `<data-form>` consumes an object resource and creates editable fields from OpenAPI schema/runtime types.
- `data-action="name"` emits a normal bubbling/composed CustomEvent with `event.detail.resource`.
- `data-operation="operationId"` executes an OpenAPI mutation through the nearest `<data-source>`.
- `<data-label>` and `form-*` provide explicit rendering/controls when automatic rendering is not enough.

Do not call `api.<operationId>()`. Components do not receive an API facade.

## Public component contract

Use `<component-property>` for inputs:

```html
<title>Rows — ${dbName}.${tableName}</title>
<component-property name="dbName" type="string" required example="app"></component-property>
<component-property name="tableName" type="string" required example="users"></component-property>
```

Primitive camelCase properties compile to kebab-case HTML attributes by default (`dbName` → `db-name`). Host applications may always set JavaScript properties directly. Use `attribute="false"` for property-only values or `attribute="custom-name"` to override the HTML attribute.

`example` is design-time data; `default` is the runtime default.

`<title>` is metadata used by manifests/development tooling and may interpolate declared properties. Do not duplicate it as a rendered heading unless the heading is actual UX content.

## Reads and resource context

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

`request` is the OpenAPI `operationId`. OpenAPI decides whether each flat parameter belongs in path/query/header. Use kebab-case attributes for camelCase parameter names. `select` narrows the response and matching schema before providing resource context.

Use one data-source per query. Multiple data-sources share Core's GET/HEAD cache and in-flight request deduplication when they use the same runtime/client.

A source may override the configured client with `.client=${client}` when necessary; normally use the project runtime client.

## Tables

Automatic table:

```html
<data-source request="listUsers">
  <data-table>
    <button data-action="open">Open</button>
    <button data-operation="deleteUser">Delete</button>
  </data-table>
</data-source>
```

Each action is cloned per row and receives that row as resource context. There is no `.actions` configuration array.

Conditional actions can use normal Lit expressions outside native templates:

```html
<data-table>
  ${writable ? html`<button data-action="edit">Edit</button>` : nothing}
</data-table>
```

Direct action children supplied by a host component instance override the default row actions of its first automatic data-table:

```html
<db-table-list @select=${event => choose(event.detail.resource)}>
  <button data-action="select">Select</button>
</db-table-list>
```

For full custom row placement use a static `<template data-row>`. Do not put Lit expressions inside the native template; use resource-aware primitives inside it.

## Forms and mutations

```html
<data-source request="getUser" id=${id}>
  <data-form>
    <button data-operation="updateUser">Save</button>
  </data-form>
</data-source>
```

`data-form` generates fields but not a Save button. The edited object becomes resource context for the authored mutation control.

The nearest data-source supplies operation parameters from its flat inputs first, then from current resource context. If the operation declares a request body, the current resource becomes that body. Top-level resource fields already represented by OpenAPI path/query/header parameters are omitted from the automatically derived body.

Successful mutations invalidate affected shared cached reads.

## Semantic application events

Use `data-action` for intent that the host application should interpret:

```html
<button data-action="open">Open</button>
```

A standalone host can consume it with Lit:

```html
<user-list @open=${event => showUser(event.detail.resource)}></user-list>
```

or plain JavaScript:

```js
document.querySelector('user-list').addEventListener('open', event => {
  showUser(event.detail.resource);
});
```

Keep routing, page layout, modal selection, and other application composition outside reusable component source.

## Finish

Run:

```bash
metaproject check
metaproject build
```
