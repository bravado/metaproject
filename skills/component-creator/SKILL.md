---
name: metaproject-component-creator
description: Create the smallest useful Metaproject UI from OpenAPI operations using data-source, data-table, data-form, and data-operation.
---

# Create Components from OpenAPI

Read `openapi.yaml`, existing `components/`, and `skills/component-authoring/SKILL.md`.

Prefer a few domain components over abstraction layers. A typical collection component is just:

```html
<data-source request="listUsers">
  <data-table></data-table>
</data-source>
```

A typical editor is:

```html
<data-source request="getUser" id=${id}>
  <data-form>
    <button data-operation="updateUser">Save</button>
  </data-form>
</data-source>
```

Rules:

- use `request="operationId"` for reads; never generate direct `api.*` calls;
- bind OpenAPI parameters as flat kebab-case attributes;
- use `select="path.to.value"` only when the useful resource is nested in the response;
- use multiple data-sources for multiple queries;
- put mutations directly on action elements with `data-operation="operationId"`;
- never generate `save=` on `<data-source>` or event-to-operation maps;
- let data-table and data-form render automatically unless the UX genuinely needs explicit markup;
- use semantic `data-action` events only for UI/navigation actions that are not API operations;
- use `navigate()` for component-to-component selection flows;
- keep required component property examples small so standalone previews work from OpenAPI examples;
- never generate cache keys, refresh tokens, custom invalidation events, or Promise composition loaders.

Finish with:

```bash
npx metaproject openapi check-examples
npx metaproject build
```
