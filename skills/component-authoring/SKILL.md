---
name: metaproject-component-authoring
description: Author Metaproject HTML-first components using declarative data-source requests, automatic data-table/data-form rendering, semantic actions, and direct data-operation actions.
---

# Metaproject Component Authoring

Canonical source lives in `components/`. Generated `public/components/` files are build output and must not be edited.

## Core primitives

Use these primitives:

- `<data-source>` executes one OpenAPI read request and provides its result as resource context.
- `<data-table>` consumes the nearest resource and renders it as a table automatically. Direct authored `data-action`/`data-operation` children become row actions in an automatic Actions column.
- `<data-form>` consumes the nearest object resource and generates editable fields from OpenAPI schema/runtime types.
- `data-action="name"` emits a normal bubbling/composed semantic CustomEvent carrying `event.detail.resource`.
- `data-operation="operationId"` executes that OpenAPI operation through the nearest `<data-source>`.
- `<data-label>` and `form-*` remain available for explicitly authored UIs.

Do not call `api.<operationId>()`. Components do not receive an API facade.

## Component title

`<title>` is component metadata and is removed from the rendered component body. Canvas uses it as the node chrome title.

It may reference declared component properties:

```html
<title>Rows — ${dbName}.${tableName}</title>
<component-property name="dbName" type="string" required example="app"></component-property>
<component-property name="tableName" type="string" required example="users"></component-property>
```

Canvas reevaluates the title when composition changes those properties. Do not duplicate the same context with a rendered `<header>`/`<h1>` unless the heading is genuinely part of the component UX.

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

Put mutations directly on action elements:

```html
<data-source request="getUser" id=${id}>
  <data-form>
    <button data-operation="updateUser">Save</button>
  </data-form>
</data-source>
```

The nearest `<data-source>` supplies operation parameters from its flat attributes. Missing operation parameters may be taken from the current resource context, which makes row actions work naturally. If the OpenAPI operation declares a request body, the current resource becomes that body. Inside `<data-form>`, that is the edited object. Top-level resource fields already declared as OpenAPI path/query/header parameters are omitted from the automatically derived request body.

Successful mutations invalidate shared cached reads automatically.

Use the same primitive for other operations:

```html
<button data-operation="deleteUser">Delete</button>
```

Do not use `save=` on `<data-source>` and do not build event-to-operation maps.

## Semantic actions

Use `data-action` for UI/application intent that is not itself an API operation:

```html
<button data-action="open">Open</button>
```

It emits a normal CustomEvent named `open` with:

```js
{
  action: 'open',
  resource,
  originalEvent
}
```

The event bubbles and crosses the component shadow boundary (`composed: true`). Standalone applications attach ordinary DOM listeners:

```html
<db-table-list
  .dbName=${dbName}
  @open=${event => showTable(event.detail.resource)}
></db-table-list>
```

or:

```js
const tables = document.querySelector('db-table-list');
tables.addEventListener('open', event => showTable(event.detail.resource));
```

Keep composition/navigation outside reusable component source when the behavior belongs to the application or Canvas.

## Tables

An array of objects generates columns from response schema/object keys. Arrays of primitives generate one Value column. An object generates Field/Value rows.

Author row actions directly as HTML inside the automatic table. Each authored action is cloned once per generated row and sees that row as its resource context:

```html
<data-source request="listUsers">
  <data-table>
    <button data-action="open">Open</button>
    <button data-operation="deleteUser">Delete</button>
  </data-table>
</data-source>
```

This automatically adds an `Actions` column. Do not use `.actions`; table actions are authored HTML, just like `data-form` actions.

Conditional actions may use normal Lit expressions because they are outside native row templates:

```html
<data-table>
  ${writable ? html`<button data-action="edit">Edit</button>` : nothing}
</data-table>
```

### Component-level row action overrides

The direct action children of an HTML-first component override the default actions of its first automatic `data-table`:

```html
<db-table-list @select=${event => choose(event.detail.resource)}>
  <button data-action="select">Select</button>
</db-table-list>
```

The projected action markup is cloned per row and receives that row's resource context. Event handlers belong on the component host (`@select` / `addEventListener`), not on the projected button template.

For full custom row placement, use a static native row template. Never put Lit expressions inside `<template data-row>`:

```html
<data-source request="listUsers">
  <data-table>
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

## Canvas composition

Canvas consumes the same semantic events through `metaproject.yaml`. Put `on:` on the source component item:

```yaml
- resource: { type: component, ref: db-table-list }
  on:
    open:
      - target: db-table-schema
        properties:
          dbName: { from: source.dbName }
          tableName: { from: event.resource.name }
      - target: db-table-rows
        properties:
          dbName: { from: source.dbName }
          tableName: { from: event.resource.name }
```

Available binding roots are:

- `source.*` — current properties of the source Canvas component;
- `event.resource.*` — the resource associated with the semantic action;
- `event.detail.*` — the semantic action detail.

Dynamic row keys are supported without JavaScript:

```yaml
id: { from: event.resource[source.primaryKey] }
```

Mappings may provide a fallback:

```yaml
primaryKey: { from: event.resource.primaryKey, default: id }
```

Use Canvas bindings for application composition. Keep `navigate()` only for components whose own reusable behavior genuinely requires navigation independent of Canvas.

## Finish

Run:

```bash
npx metaproject openapi check-examples
npx metaproject build
```
