# Changelog

This file describes user-visible Metaproject Core releases. Release artifacts and
GitHub release notes are published from the release tag.

## [0.11.0] — Planned first public release

### Highlights

- Build reusable browser-native Web Components from HTML-first component sources,
  with a shared host runtime in `index.js`, a convenience `all.js` loader, and
  independent component bundles.
- Connect declarative `<data-source>`, `<data-table>`, and `<data-form>` elements
  to operations identified by OpenAPI `operationId`; use `data-action` for host
  application intent and `data-operation` for API mutations.
- Use isolated API scopes to compose local and remotely hosted components with
  the current runtime ABI v1.
- Validate OpenAPI 3.0/3.1 within the [supported subset](docs/openapi-support.md),
  including explicit diagnostics for unsupported and partially supported features.
- Initialize, check, build, import OpenAPI documents, mutate schemas/operations,
  and execute modeled API operations with `npx metaproject`.
- Use the documented `metaproject/components` and `metaproject/data-source`
  runtime exports and the experimental compiler, browser compiler, Vite, OpenAPI,
  and project tooling entry points.
- Distribute project-bootstrap, API analysis/import, and component-authoring skills
  to support development workflows.
- Verify package exports, generated assets, example applications, browser
  behavior, and installation from a packed npm tarball in CI.

### Supported environment

- Node.js 22.12.0 or newer on maintained Node release lines.
- Browser output targeting ES2022 with modern browser platform APIs.
- Optional Vite integration for Vite 6 or newer.

The `0.11.0` tag and npm package publication are performed separately as part
of final release preparation. This entry describes the intended first public
contract and does not indicate that 0.11.0 has already been published.
