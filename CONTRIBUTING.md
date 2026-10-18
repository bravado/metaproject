# Contributing to Metaproject Core

Thank you for helping improve Metaproject. Before proposing changes, read
[the project README](README.md), the
[public JavaScript API policy](docs/public-api.md), and the
[OpenAPI support matrix](docs/openapi-support.md).

## Development setup

Use Node.js **22.12.0 or newer** and npm. From a clone of the repository:

```bash
npm ci
npm test
npm run check
npm run test:examples
```

For browser integration tests, install Chromium once and then run:

```bash
npx playwright install --with-deps chromium
npm run test:browser
```

CI tests Node.js 22.12.0, 24, and 26, plus a Chromium browser run.

## Repository layout

| Directory | Responsibility |
| --- | --- |
| `components/` and `data-source/` | Browser runtime and data primitives |
| `compiler/` and `vite/` | Component compilation and optional Vite integration |
| `openapi/`, `operations/`, `project/` | OpenAPI/project modeling and validation |
| `build/` and `bin/` | Static build and CLI |
| `init/`, `api/`, `mock-api/` | Project initialization and supporting tooling |
| `skills/` | Shipped development-agent guidance |
| `examples/` | Runnable integration examples |
| `tests/` | Unit, consumer, and browser verification |

## Public API and compatibility

The 0.11 public package surface is intentionally limited to the subpaths in
`package.json#exports`. The browser runtime entry points
`metaproject/components` and `metaproject/data-source` are stable for
0.11.x. Compiler, Vite, OpenAPI, and project tooling entry points are
experimental. There is no root `import 'metaproject'` entry.

Do not expose internal source modules simply to enable an implementation
shortcut. Keep browser entry points free of Node-only dependencies, preserve
the runtime ABI contract for independently built components, and update tests
and docs when public behavior changes. The project targets its documented
OpenAPI subset; unsupported semantics should produce explicit diagnostics.

The current project configuration uses `version: 1`. Release version changes
are handled separately by the release maintainers.

## Preparing a contribution

1. Open or reference an issue describing the change, its scope, and any
   public API implications.
2. Make a focused branch and keep tests for new behavior alongside code.
3. Run the checks above and verify example or browser flows if affected.
4. For changes that affect packaging, run:

```bash
mkdir -p dist
npm pack --pack-destination dist
node tests/packed-consumer.mjs dist/*.tgz
node tests/packed-browser-smoke.mjs dist/*.tgz
```

   The browser smoke test requires the Chromium installation described above.
   Run both consumer tests against the **same tarball**. CI also verifies the
   packed artifact in a separate Chromium job.

5. Open a pull request with a description of behavior, tests, and any
   compatibility implications. Repository maintainers review changes before
   merging.

This project has no committed credentials requirement. Never add real API
tokens, customer data, or private keys to fixtures, test logs, or examples.

## Bug reports and security issues

Use [GitHub Issues](https://github.com/bravado/metaproject/issues) for ordinary
bugs and feature requests. Report potential vulnerabilities **privately** by
following [SECURITY.md](SECURITY.md), not through a public issue.

## GitHub Releases

The 0.11 distribution is a verified GitHub Release tarball, not an npm registry
publication. See [release procedure](docs/releasing.md) for safe rehearsal,
protected annotated tags, artifact verification and approval requirements.
