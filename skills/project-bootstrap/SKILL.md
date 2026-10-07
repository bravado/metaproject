---
name: metaproject-project-bootstrap
description: Start a Metaproject project from scratch by designing the browser-facing OpenAPI contract first, then generating reusable Web Components.
---

# Bootstrap a New Metaproject Project

Use this when there is no existing application contract to adopt.

## Goal

Treat Metaproject as the glue between an API contract and reusable Web Components:

```text
API contract (OpenAPI)
        ↓
Metaproject data runtime + compiler
        ↓
Web Components usable by any application
```

Components must remain independent of any particular host application.

## Process

1. Run `metaproject init` if the project is not initialized.
2. Define the smallest browser-facing API needed for the first useful workflow.
3. Put API endpoints in the top-level OpenAPI `servers` list. The first server is the generated runtime default; additional servers are alternate deployments/tools targets.
4. Describe authentication with standard OpenAPI `components.securitySchemes` and root/operation `security`. Never write credentials, tokens, passwords, certificates, or private keys into the spec.
5. Add reusable schemas and stable operations to `openapi.yaml`.
6. Give every operation/schema an `x-project-id` and every response body a small representative success example.
7. Use the deterministic mutation tools when adding/updating modeled resources:

```bash
metaproject openapi upsert-schema --input /tmp/schema.json
metaproject openapi upsert-operation --input /tmp/operation.json
```

8. Run `metaproject openapi check-examples`.
9. Follow `node_modules/metaproject/skills/component-creator/SKILL.md`.
10. Run:

```bash
metaproject check
metaproject build
```

## Rules

- Design HTTP capabilities, not source-code methods.
- Keep endpoint/deployment information in OpenAPI `servers`, not a separate Metaproject API-root setting.
- Keep operation IDs stable and meaningful (`listUsers`, `getUser`, `updateUser`).
- Prefer reusable schemas for objects shared by multiple operations.
- Add examples that make components useful before a live backend exists.
- Do not put application routing/layout into reusable component source; emit semantic `data-action` events and let the host application decide what they mean.
- Do not introduce application-specific runtime dependencies. Generated components must remain useful in plain HTML, Lit, React/Vue wrappers, server-rendered applications, and other hosts.
