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

## Make every top-level component showcase-ready

Each generated top-level component should render meaningfully by itself with minimal data:

- API-backed reads use `api.<operationId>()`, whose response comes from the explicit OpenAPI example in development.
- required component properties use `<component-property ... example="...">` so the component can render without external setup.
- lists show a few important columns, not every schema field.
- detail/edit components show only useful user-facing fields.
- create forms may start empty; edit forms should use the item GET example.
- avoid requiring hidden global state merely to display the component.

Do not copy response mock objects into component source. OpenAPI owns API examples.

## Build straightforward interactions

Use the actual `operationId`:

```html
<data-source .resource=${api.getUser({ path: { id } })}>
  <data-label field="name"></data-label>
</data-source>
```

For actions:

```html
<data-source
  .resource=${api.getUser({ path: { id } })}
  @save=${event => api.updateUser({
    path: { id: event.detail.resource.id },
    body: event.detail.resource
  })}>
  <form-input field="name" label="Name" required></form-input>
  <button type="button" data-action="save" data-validate>Save</button>
</data-source>
```

Use `navigate('<component-tag>', properties)` for simple component-to-component flows such as list → detail/edit.

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

Verify that every `api.<operationId>()` exists, every top-level component has enough example-backed data to render usefully, composed tags exist, and generated `public/components/` files were not edited manually.
