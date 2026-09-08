---
name: metaproject-component-creator
description: Create a small, straightforward set of Metaproject components from the Operations, schemas, and examples already present in openapi.yaml.
---

# Create Components from OpenAPI

Use this skill after the API has been modeled or imported.

Read:

- `openapi.yaml`
- existing `components/`
- `node_modules/metaproject/skills/component-authoring/SKILL.md`

Do not redesign the backend. If a required capability or example is missing, update `openapi.yaml` through the application-analysis skill first.

## Create the smallest useful UX

Derive components from actual Operations, not from schemas alone.

Typical mapping:

- collection GET → `<resource>-list`
- item GET → `<resource>-detail` only when useful
- POST → `<resource>-create` or reusable `<resource>-form>`
- PUT/PATCH → `<resource>-edit` or reusable `<resource>-form>`
- DELETE → action in an existing component, not a delete-only component

Prefer a few obvious components over a large abstraction hierarchy. Extract reusable components only for stable concepts that are genuinely reused.

## DataSource rule

API-backed components inherit their DataSource automatically. Resolution is:

1. explicit component `.dataSource`;
2. nearest contextual `<data-source>` provider;
3. project default DataSource generated from `openapi.yaml` + `api_root`.

Therefore **do not generate a `<data-source>` wrapper around a component's normal API reads**.

Use `<data-source>` only when the component intentionally creates or overrides a DataSource for a subtree, such as a secondary backend or an isolated subquery scope.

Use `api.<operationId>()` directly in the component:

```html
<data-table
  .resource=${Promise.resolve(api.listUsers()).then(page => page?.data || page || [])}
></data-table>
```

The shared DataSource owns GET caching, in-flight deduplication, subscriptions, and mutation invalidation. Do not generate cache keys, refresh tokens, custom invalidation events, or duplicate request stores.

Use `<data-resource>` only when a fetched/supplied object must become resource context for nested `data-label` or `form-*` fields:

```html
<data-resource .resource=${api.getUser({ path: { id } })}
  @save=${event => api.updateUser({
    path: { id },
    body: event.detail.resource
  })}
>
  <form-input field="name" label="Name"></form-input>
  <button type="button" data-action="save" data-validate>Save</button>
</data-resource>
```

## Make every top-level component showcase-ready

Each generated top-level component should render meaningfully by itself with minimal data:

- API-backed reads use `api.<operationId>()`, whose response comes from explicit OpenAPI examples in Canvas Mock mode;
- required component properties use `<component-property ... example="...">`;
- lists show a few important columns, not every schema field;
- detail/edit components show only useful user-facing fields;
- create forms may start empty; edit forms should use the item GET example;
- avoid hidden global application state.

Do not copy response mock objects into component source. OpenAPI owns API examples.

## Build straightforward interactions

For collection tables, keep `<template data-row>` completely static. Never generate Lit expressions, property bindings, or event bindings inside the native template. Put handlers on `<data-table>` and use row context inside the template:

```html
<data-table
  .resource=${api.listUsers()}
  @open=${event => navigate('user-detail', { id: event.detail.resource.id })}
>
  <table>
    <tbody>
      <template data-row>
        <tr>
          <td><data-label field="name"></data-label></td>
          <td><button type="button" data-action="open">Open</button></td>
        </tr>
      </template>
    </tbody>
  </table>
</data-table>
```

If fields are runtime-defined, use `data-table` auto mode:

```html
<data-table
  .resource=${rows}
  .columns=${columns.map(column => ({ field:column.name, label:column.name }))}
  .actions=${[{name:'edit',label:'Edit'}]}
  @edit=${event => navigate('row-edit', { id:event.detail.resource.id })}
></data-table>
```

Use `navigate('<component-tag>', properties)` for simple component-to-component flows. One semantic action may update more than one independent panel by calling `navigate()` for each target when those panels represent the same selection.

Successful POST/PUT/PATCH/DELETE operations invalidate cached reads through the shared DataSource automatically. Let subscribed sibling components refresh themselves; do not manually patch them.

## Form mapping

Use request schemas to choose controls:

- string → `form-input`
- email → `form-input type="email"`
- long text → `form-textarea`
- boolean → `form-checkbox`
- enum → `form-select` or `form-radio` for a very small choice set
- integer/number → typed `form-input`

Do not expose immutable IDs, timestamps, audit fields, or computed fields unless users really edit them.

## Finish

Run:

```bash
npx metaproject openapi check-examples
npx metaproject build
```

Verify that every `api.<operationId>()` exists, every top-level component has enough example-backed data to render usefully, components do not add unnecessary `<data-source>` wrappers, every `<template data-row>` is static, and generated `public/components/` files were not edited manually.
