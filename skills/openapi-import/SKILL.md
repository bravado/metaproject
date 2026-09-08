---
name: metaproject-openapi-import
description: Adopt an existing OpenAPI 3.x contract into Metaproject, normalize it for component tooling, add representative examples, then create reusable Web Components.
---

# Adopt an Existing OpenAPI Contract

Use this when the application already has an OpenAPI/Swagger contract that describes the browser-facing API.

## Import

Initialize Metaproject first if needed:

```bash
npx metaproject init
```

Import a bundled OpenAPI 3.x YAML/JSON file or URL:

```bash
npx metaproject import-openapi ./docs/openapi.yaml
npx metaproject import-openapi https://example.test/openapi.json
```

Import copies the contract into the Metaproject-owned `openapi.yaml`, preserves existing `operationId` values, generates missing operation IDs, and adds stable `x-project-id` values required by Metaproject tooling.

If the source is a multi-file specification with external `$ref` files, prefer pointing `metaproject.yaml` directly at that existing root spec:

```yaml
openapi: docs/openapi.yaml
```

Core build/ref resolution supports local external references. Do not flatten a multi-file contract by hand just for Canvas.

## Review after import

1. Verify imported operations match the browser-facing API you actually intend components to call.
2. Remove irrelevant/internal operations if the imported contract is much broader than the UI surface.
3. Add representative success examples to every operation with a response body.
4. Ensure examples are coherent across navigable resources (IDs/names selected from lists should have matching downstream examples).
5. Run:

```bash
npx metaproject openapi check-examples
npx metaproject check
```

6. Follow `node_modules/metaproject/skills/component-creator/SKILL.md`.

## Do not reverse-engineer unnecessarily

When the existing OpenAPI contract is accurate, treat it as the source of truth. Inspect application routes/controllers only when the contract is incomplete, stale, or missing behavior needed by the UI. In that case follow `skills/application-analysis/SKILL.md` for the missing pieces.
