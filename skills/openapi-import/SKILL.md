---
name: metaproject-openapi-import
description: Adopt an existing OpenAPI 3.0/3.1 contract within Core's supported subset while preserving stable IDs and existing multi-file structure where appropriate.
---

# Adopt an Existing OpenAPI Contract

Use this when the application already has an OpenAPI/Swagger contract that describes the browser-facing API.

## Preserve before importing

Inspect `metaproject.yaml`, the configured OpenAPI contract, and the source contract before choosing an import strategy.

Preserve existing `operationId` values whenever the same operation already has one. Do not rename stable operation IDs merely to match a naming preference or generated convention. Preserve existing stable `x-project-id` values in a Metaproject-owned contract when updating the same modeled resource.

If the application's authoritative contract is intentionally multi-file, prefer keeping that structure and pointing `metaproject.yaml` at its root document. Do not flatten or copy a multi-file contract merely for convenience.

## Import a bundled contract

Initialize Metaproject first if needed:

```bash
metaproject init
```

Import a bundled OpenAPI 3.0/3.1 YAML/JSON file or URL:

```bash
metaproject import-openapi ./docs/openapi.yaml
metaproject import-openapi https://example.test/openapi.json
```

Import copies the contract into the Metaproject-owned `openapi.yaml`, preserves source `operationId` values, generates only missing operation IDs, and adds missing stable `x-project-id` values required by Metaproject tooling. Run `metaproject check` after import and use `docs/openapi-support.md` as the compatibility boundary.

If `openapi.yaml` already contains modeled resources, do not force-replace it as a routine rerun. Compare the existing contract with the source first. Use `--force` only when replacement is explicitly intended and preservation of Metaproject-owned IDs/customizations is not required.

## Multi-file contracts

If the source is a multi-file specification with external `$ref` files, point `metaproject.yaml` directly at that existing root spec:

```yaml
openapi: docs/openapi.yaml
```

Core build/ref resolution supports local external references. Keep the repository's established file boundaries and stable operation IDs. Update only the files that own missing or stale API pieces; do not flatten the contract unnecessarily.

## Review after import

1. Verify imported operations match the browser-facing API you actually intend components to call.
2. Preserve stable operation IDs from the authoritative contract.
3. Remove irrelevant/internal operations only when the Metaproject-owned copy is intentionally scoped to the UI surface.
4. Add representative success examples to every operation with a response body.
5. Ensure examples are coherent across navigable resources (IDs/names selected from lists should have matching downstream examples).
6. Run:

```bash
metaproject openapi check-examples
metaproject check
```

7. Follow `node_modules/metaproject/skills/component-creator/SKILL.md`.

## Do not reverse-engineer unnecessarily

When the existing OpenAPI contract is accurate, treat it as the source of truth. Inspect application routes/controllers only when the contract is incomplete, stale, or missing behavior needed by the UI. In that case follow `skills/application-analysis/SKILL.md` for only the missing or stale pieces.
