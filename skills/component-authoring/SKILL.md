---
name: metaproject-component-authoring
description: Author Metaproject HTML-first components using declarative data-source requests, automatic data-table/data-form rendering, direct data-operation actions, and navigation.
---

# Metaproject Component Authoring

Canonical source lives in `components/`. Generated `public/components/` files are build output and must not be edited.

## Core primitives

Use these primitives:

- `<data-source>` executes one OpenAPI read request and provides its result as resource context.
- `<data-table>` consumes the nearest resource and renders it as a table automatically. Add explicit table markup only when the default table is not enough.
- `<data-form>` consumes the nearest object resource and generates editable fields from OpenAPI schema/runtime types.
- `data-operation="operationId"` on an action element executes that OpenAPI operation through the nearest `<data-source>`.
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

## Operations

Put the mutation operation directly on the action element:

```html
<data-source request="getUser" id=${id}>
  <data-form>
    <button data-operation="updateUser">Save</button>
  </data-form>
</data-source>
```

The nearest `<data-source>` supplies operation parameters from its flat attributes. Missing operation parameters may be taken from the current resource context, which makes row actions work naturally. If the OpenAPI operation declares a request body, the current resource becomes that body. Inside `<data-form>`, that is the edited object.

Successful mutations invalidate shared cached reads automatically.

Use the same primitive for other operations:

```html
<button data-operation="deleteUser">Delete</button>
```

Do not use `save=` on `<data-source>` and do not build event-to-operation maps.

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

`data-form` does not generate a Save button. Put authored action elements inside it; they are rendered through its slot and see the edited object as their resource context.

Use explicit `form-*` controls only when the automatic form is not sufficient.

## Navigation

Use `navigate('<component-tag>', properties)`. A single selection may update multiple independent panels by calling `navigate()` for each target.

## Finish

Run:

```bash
npx metaproject openapi check-examples
npx metaproject build
```
