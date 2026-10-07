---
name: metaproject-application-analysis
description: Analyze an existing application without a sufficient API contract, make focused OpenAPI updates for browser-facing behavior, then generate reusable Web Components.
---

# Analyze an Existing Application

Use this when an application already exists but its browser-facing API is missing or incompletely modeled.

If a usable OpenAPI 3.0/3.1 contract within Core's documented support matrix already exists, use `node_modules/metaproject/skills/openapi-import/SKILL.md` first instead of reverse-engineering the application.

## Goal

Model the API surface needed by reusable Web Components. Metaproject is the glue layer:

```text
existing application/backend
        ↓ browser-facing HTTP contract
openapi.yaml
        ↓
Metaproject data-source + compiler
        ↓
reusable Web Components
```

Do not model every controller/service method. Model stable HTTP capabilities that a browser component should consume.

## Rerun and preservation contract

Always read the configured OpenAPI contract before analyzing source. Build a short inventory of operations/schemas that already cover the requested workflow and classify each as **current**, **missing**, or **stale**.

On reruns:

- leave current operations and schemas unchanged;
- add only missing browser-facing capabilities;
- update only stale fields whose behavior is contradicted by application source/tests or the task;
- preserve existing stable `operationId` and `x-project-id` values when the same capability still exists;
- preserve descriptions, examples, security metadata, extensions, and schema details that are not made stale by the discovered behavior;
- do not broadly regenerate or reformat the whole OpenAPI document as a side effect of modeling one workflow.

If an endpoint was removed from the application, confirm it is genuinely gone before removing its contract entry. If the intended replacement is unclear, report the discrepancy rather than guessing.

## What to inspect

Read `metaproject.yaml`, the configured OpenAPI file, the configured component source directory, and only the application source needed to understand browser-visible behavior. Depending on the stack, inspect:

- route/router definitions;
- controllers/handlers/actions;
- request validation and parameter definitions;
- serializers/resources/DTOs and response builders;
- existing browser fetch/AJAX calls;
- server-rendered templates that reveal user workflows;
- domain types needed to describe request/response data.

Ignore dependencies, caches, generated component output, uploads, and unrelated assets. Prefer static source analysis; do not require the application to run unless source is insufficient.

## Process

1. Identify the first complete user workflow to model.
2. Compare that workflow with the configured OpenAPI contract before changing it.
3. List the HTTP requests the browser needs for that workflow.
4. Reuse existing operations/schemas when they already describe the behavior correctly.
5. Add missing resources or update only stale resources in the configured OpenAPI document.
6. Use deterministic mutation commands rather than fragile YAML surgery when practical:

```bash
metaproject openapi upsert-schema --input /tmp/schema.json
metaproject openapi upsert-operation --input /tmp/operation.json
```

7. Every new or updated operation must have:
   - HTTP method and path;
   - stable `operationId`;
   - stable `x-project-id`;
   - path/query/header parameters and request body when applicable;
   - success response schema;
   - representative success example when the response has content.
8. Every reusable schema under `components.schemas` must have a stable `x-project-id`.
9. Validate:

```bash
metaproject openapi check-examples
metaproject check
```

10. Then follow `node_modules/metaproject/skills/component-creator/SKILL.md`.

## Examples are development data

Keep examples small but useful:

- collection: normally 2 representative records;
- item: 1 representative record;
- create/update: 1 resulting record;
- scalar: 1 realistic value;
- no-content response: no example needed.

Use synthetic, non-sensitive values. Prefer a representative normal state over an empty response.

When one response exposes IDs/names used by downstream operations, keep examples coherent. If multiple request values need different examples, use `x-metaproject-match`:

```yaml
examples:
  first:
    x-metaproject-match:
      path: { id: '1' }
    value: { id: 1, name: Ada }
  second:
    x-metaproject-match:
      path: { id: '2' }
    value: { id: 2, name: Grace }
```

The matcher may use request-shaped `path`, `query`, `headers`, or `body` subsets.

## When source and contract disagree

Do not silently guess. Prefer the behavior actually exposed to browser clients, document the discrepancy in your work summary, and update only the contract pieces whose intended behavior is clear from source/tests or the task requirements.
