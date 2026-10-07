---
name: metaproject-component-creator
description: Create or update the smallest useful reusable Web Components from modeled OpenAPI operations while preserving deliberate existing behavior.
---

# Create Components from OpenAPI

Read the configured OpenAPI document, the configured component source directory, every existing component relevant to the requested workflow, and `skills/component-authoring/SKILL.md` before editing anything.

The output is reusable Web Components. Each component should work in any host application; application routing and layout belong to the host.

## Rerun contract

Treat existing component source as deliberate application code, not disposable generated text.

Before creating a component:

1. inspect existing component HTML, CSS, JavaScript/TypeScript, public properties, semantic `data-action` events, and referenced OpenAPI operations;
2. reuse or extend an existing component when it already represents the same domain object or user workflow;
3. create a new component only when the requested behavior is meaningfully separate.

On reruns, make the smallest change required by the current OpenAPI contract and task. Preserve hand-written markup, styles, helper logic, public properties, semantic events, titles, and host-facing behavior unless an API change makes preservation impossible.

Never replace an existing component wholesale just because a simpler generated version could be produced.

## OpenAPI is the operation boundary

Every `request="operationId"` and `data-operation="operationId"` must refer to an operation that already exists in the configured OpenAPI contract.

**Never invent an OpenAPI operation or operationId from component intent.** If the component needs an HTTP capability that is not modeled, stop that component change and update the contract through the appropriate workflow first:

- existing application behavior that is missing/stale: `skills/application-analysis/SKILL.md`;
- new API/application design: `skills/project-bootstrap/SKILL.md`.

Do not substitute a guessed operation with a similar name.

## Grouping heuristics

Prefer coherent domain/workflow components over one component per OpenAPI operation.

Good boundaries usually represent something a host application can place or reuse directly, for example:

- a user list with row actions;
- a user editor that reads and updates one user;
- an order summary that combines the small set of reads needed for that summary.

Operations are implementation capabilities, not component boundaries. A list/get/update trio may naturally become two components (`user-list`, `user-editor`) rather than three components.

Split components when they have distinct host-facing purpose, independent reuse, substantially different public inputs/events, or would otherwise become difficult to understand.

## Operation evolution

When the OpenAPI contract changes:

- **operation added:** use it only when it belongs to an existing component's workflow; otherwise create a separate component only if there is a distinct reusable UI purpose;
- **operation changed:** update request/parameter/body bindings while preserving the component's public properties, semantic events, CSS, helper code, and authored structure where possible;
- **operation renamed with the same behavior:** update the internal operation reference, but do not rename the component or its public contract just to mirror the new operationId;
- **operation removed:** remove or replace references only when the contract provides a valid replacement. If required behavior no longer has an operation, do not invent one; report the contract/component mismatch;
- **response/schema changed:** adapt the smallest affected rendering/form behavior and preserve unrelated authored markup and events.

If an API change truly requires a breaking component change, make that change explicit in the work summary instead of silently changing the public component contract.

## Component patterns

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

See `docs/openapi-component-workflow.md` for a small OpenAPI → component example that also demonstrates rerun preservation.

Finish with:

```bash
metaproject check
metaproject build
```

## Standalone component distribution

Components share the host application's Metaproject runtime. Keep each component's HTML and helpers self-contained: a built `<tag>.js` must not assume a second runtime or depend on sibling build files. Use a unique project `scope` in `metaproject.yaml` when components may be hosted independently. The host loads `index.js` before any local or remote component bundles.
