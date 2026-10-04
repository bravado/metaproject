---
name: metaproject-component-creator
description: Create the smallest useful reusable Web Components from modeled OpenAPI operations using data-source, data-table, data-form, semantic data-action events, and data-operation.
---

# Create Components from OpenAPI

Read the configured OpenAPI document, existing component source, and `skills/component-authoring/SKILL.md`.

The output is reusable Web Components. Each component should work in any host application; application routing and layout belong to the host.

Prefer a few domain components over abstraction layers. Put component context in `<title>` metadata instead of rendering duplicate headings.

A collection component can be:

```html
<title>Users</title>
<data-source request="listUsers">
  <data-table></data-table>
</data-source>
```

A collection with semantic row intent:

```html
<title>Users</title>
<data-source request="listUsers">
  <data-table>
    <button data-action="edit">Edit</button>
  </data-table>
</data-source>
```

The component emits the normal `edit` CustomEvent. A host application handles it with `@edit=${...}` or `addEventListener('edit', ...)`.

A parameterized mutation component:

```html
<title>User — ${id}</title>
<component-property name="id" type="string" required example="1"></component-property>
<data-source request="getUser" id=${id}>
  <data-form>
    <button data-operation="updateUser">Save</button>
  </data-form>
</data-source>
```

Rules:

- use `<title>` as component metadata; do not generate a matching `<header>`/`<h1>` unless it is real UX content;
- title text may reference declared component properties with `${property}`;
- declare public inputs with `<component-property>`; primitive camelCase properties compile to kebab-case HTML attributes (`dbName` → `db-name`);
- use `request="operationId"` for reads; never generate direct `api.*` calls;
- bind OpenAPI parameters on `<data-source>` as flat kebab-case attributes;
- use `select="path.to.value"` only when the useful resource is nested in the response;
- use multiple `<data-source>` elements for multiple queries; they share Core's query cache;
- put mutations directly on action elements with `data-operation="operationId"`;
- never generate `save=` on `<data-source>` or event-to-operation maps;
- let `data-table` and `data-form` render automatically unless the UX genuinely needs explicit markup;
- put automatic row actions directly inside `<data-table>` as `data-action` / `data-operation` HTML; never generate `.actions` arrays;
- use semantic `data-action` events for UI/application intent that is not itself an API operation;
- keep host routing/composition out of reusable component source;
- direct action children on a component are row-action overrides for its first automatic `data-table`;
- keep property examples small so development previews are useful;
- never generate cache keys, refresh tokens, custom invalidation events, or Promise composition loaders.

Finish with:

```bash
npx metaproject check
npx metaproject build
```
