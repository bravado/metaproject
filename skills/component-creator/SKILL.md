---
name: metaproject-component-creator
description: Create the smallest useful Metaproject UI from OpenAPI operations using data-source, data-table, data-form, semantic data-action events, and data-operation.
---

# Create Components from OpenAPI

Read `openapi.yaml`, existing `components/`, and `skills/component-authoring/SKILL.md`.

Prefer a few domain components over abstraction layers. Put component context in `<title>` metadata instead of rendering duplicate headings.

A typical collection component is just:

```html
<title>Users</title>
<data-source request="listUsers">
  <data-table></data-table>
</data-source>
```

A collection with a row action remains reusable and HTML-first:

```html
<title>Users</title>
<data-source request="listUsers">
  <data-table>
    <button data-action="edit">Edit</button>
  </data-table>
</data-source>
```

The component emits the semantic `edit` event. A standalone app handles it with `@edit=${...}` / `addEventListener('edit', ...)`; Canvas composition belongs in `metaproject.yaml` `on:` bindings.

A parameterized component can expose its active context through the Canvas title:

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

- use `<title>` for component/chrome context; do not generate a matching `<header>`/`<h1>` inside the component;
- title text may reference declared component properties with `${property}`;
- use `request="operationId"` for reads; never generate direct `api.*` calls;
- bind OpenAPI parameters as flat kebab-case attributes;
- use `select="path.to.value"` only when the useful resource is nested in the response;
- use multiple data-sources for multiple queries;
- put mutations directly on action elements with `data-operation="operationId"`;
- never generate `save=` on `<data-source>` or event-to-operation maps;
- let data-table and data-form render automatically unless the UX genuinely needs explicit markup;
- put automatic table row actions directly inside `<data-table>` as `data-action` / `data-operation` HTML; never generate `.actions` arrays;
- use semantic `data-action` events for UI/application intent that is not itself an API operation;
- keep Canvas/application composition out of reusable component source; prefer `metaproject.yaml` `on:` bindings instead of `navigate()`;
- direct action children on a component are row-action overrides for its first automatic data-table;
- keep required component property examples small so standalone previews and initial Canvas titles are useful;
- never generate cache keys, refresh tokens, custom invalidation events, or Promise composition loaders.

Finish with:

```bash
npx metaproject openapi check-examples
npx metaproject build
```
