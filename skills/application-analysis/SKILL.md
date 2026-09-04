---
name: metaproject-application-analysis
description: Analyze an existing application, model its browser-facing API in openapi.yaml, add small representative examples, then hand UI creation to the Metaproject component-creator skill.
---

# Analyze an Application

Use this skill when adopting Metaproject in an existing application or when a feature needs API modeling before UI work.

## Goal

Produce a small, accurate `openapi.yaml` that contains everything the browser UI needs, then continue with:

`node_modules/metaproject/skills/component-creator/SKILL.md`

## Process

1. Read `metaproject.yaml`, `openapi.yaml`, existing `components/`, and the relevant application source.
2. Identify user-facing HTTP capabilities, request inputs, response shapes, and reusable entities.
3. Model only externally meaningful API behavior. Do not create one Operation per source-code method.
4. Create/update Entities and Operations in `openapi.yaml`.
5. Add deliberate examples for every Operation.
6. Run `npx metaproject openapi check-examples`.
7. Continue with the component-creator skill unless the user asked for analysis only.

For existing applications, inspect only relevant routes, controllers, request validation, serializers, templates, browser JavaScript, and domain types. Ignore dependencies, caches, generated `public/components/`, uploads, and unrelated assets.

## OpenAPI rules

`openapi.yaml` is canonical. Every backend call used by a component must be an Operation with:

- HTTP method and path
- stable `operationId`
- stable `x-project-id`
- parameters/request body when applicable
- success response schema
- an explicit success example whenever the response has content

Reusable schemas under `components.schemas` must have stable `x-project-id` values.

Components must call `api.<operationId>()`; do not duplicate URLs or HTTP methods in component code.

## Examples

Examples are required development data, not documentation decoration. Keep them small and useful:

- collection response: normally 2 representative records
- item response: 1 representative record
- create/update response: 1 representative resulting record
- scalar response: 1 realistic value
- no-content response: no example is needed

Prefer a predictable default example:

```yaml
responses:
  '200':
    description: Users
    content:
      application/json:
        schema:
          type: array
          items:
            $ref: '#/components/schemas/User'
        examples:
          default:
            value:
              - id: 1
                name: Ada Lovelace
              - id: 2
                name: Grace Hopper
```

Use synthetic, non-sensitive values. Avoid huge payloads. The default example should demonstrate the normal successful state rather than an empty collection when representative data is possible.

If required path/query values are useful for exercising the Operation, also provide `example` on those parameters.

## Deterministic mutations

After deciding the API semantics, prefer Metaproject's mutation commands over hand-editing YAML structure:

```bash
npx metaproject openapi upsert-entity --input /tmp/entity.json
npx metaproject openapi upsert-operation --input /tmp/operation.json
```

Preserve existing `x-project-id` values when editing manually.

If the application already exposes an OpenAPI 3.x document, import it first:

```bash
npx metaproject import-openapi https://example.test/openapi.yaml
```

Then inspect the local model and fill missing schemas/examples instead of reverse-engineering endpoints unnecessarily.

## Handoff

When the API contract is complete and `npx metaproject openapi check-examples` passes, read and apply:

`node_modules/metaproject/skills/component-creator/SKILL.md`

The component creator must use the modeled Operations as-is. If UI work reveals a missing backend capability, return here and model it first.
