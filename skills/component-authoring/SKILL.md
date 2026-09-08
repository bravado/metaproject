---
name: metaproject-component-authoring
description: Author Metaproject HTML-first components using declarative data-source requests, automatic data-table/data-form rendering, semantic actions, and navigation.
---

# Metaproject Component Authoring

Canonical source lives in `components/`. Generated `public/components/` files are build output and must not be edited.

## Core primitives

Use these primitives:

- `<data-source>` executes one OpenAPI request and provides its result as resource context.
- `<data-table>` consumes the nearest resource and renders it as a table automatically. Add explicit table markup only when the default table is not enough.
- `<data-form>` consumes the nearest object resource, generates fields from OpenAPI schema/runtime types, and emits `save`.
- `<data-label>` and `form-*` remain available for explicitly authored UIs.

Do not call `api.<operationId>()`. Components do not receive an API facade.

## Reads

Use the OpenAPI `operationId` directly:

```html
<data-source request="listUsers">
  <data-table></data-table>
</data-source>
```

Operation parameters are flat attributes. Metaproject maps them to path/query/header parameters using OpenAPI metadata:

```html
<data-source
  request="listRows"
  db-name=${dbName}
  table-name=${tableName}
  limit="50"
  select="data"
>
  <data-table></data-table>
</data-source>
```

Use kebab-case attributes for camelCase OpenAPI parameters (`db-name` → `dbName`). `select` is a simple property path applied to the response.

A client override is exceptional and explicit:

```html
<data-source request="listInvoices" .client=${billingClient}>
  <data-table></data-table>
</data-source>
```

Otherwise the compiled project's default REST client is used.

## Multiple queries

Use multiple `<data-source>` elements. Do not build Promise composition loaders.

```html
<data-source request="getTableSchema" db-name=${dbName} table-name=${tableName} select="columns">
  <data-table></data-table>
</data-source>

<data-source request="getRow" db-name=${dbName} table-name=${tableName} id=${id}>
  <data-form></data-form>
</data-source>
```

## Save

`data-source` may declare one mutation operation with `save`:

```html
<data-source
  request="getUser"
  save="updateUser"
  id=${id}
>
  <data-form></data-form>
</data-source>
```

`data-form` emits `save` with the edited resource. `data-source` sends that resource as the mutation body. Successful mutations invalidate shared cached reads automatically.

## Tables

An array of objects generates columns from response schema/object keys. Arrays of primitives generate one Value column. An object generates Field/Value rows.

For custom row markup, use a static native row template. Never put Lit expressions inside `<template data-row>`:

```html
<data-source request="listUsers">
  <data-table @open=${event => navigate('user-edit', { id:event.detail.resource.id })}>
    <table><tbody><template data-row>
      <tr>
        <td><data-label field="name"></data-label></td>
        <td><button type="button" data-action="open">Open</button></td>
      </tr>
    </template></tbody></table>
  </data-table>
</data-source>
```

## Forms

`data-form` generates controls from the object response schema when available, then falls back to runtime value types. Strings become text inputs, numbers numeric inputs, booleans checkboxes, enums selects, and objects/arrays JSON textareas. `readOnly` schema properties are disabled.

Use explicit `form-*` controls only when the automatic form is not sufficient.

## Navigation

Use `navigate('<component-tag>', properties)`. A single selection may update multiple independent panels by calling `navigate()` for each target.

## Finish

Run:

```bash
npx metaproject openapi check-examples
npx metaproject build
```
