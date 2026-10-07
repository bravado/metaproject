# JavaScript API and compatibility

Metaproject 0.11 exposes a small set of intentional package subpaths. There is no root `import 'metaproject'` entry point.

Keeping browser runtime APIs and Node/tooling APIs on explicit subpaths avoids a large root barrel and makes the compatibility boundary visible at the import site.

## Compatibility levels

**Stable** entry points are supported throughout the 0.11.x line. Patch releases may add exports or fix behavior, but should not intentionally remove or incompatibly change documented stable exports.

**Experimental** entry points are public and supported, but their named exports and detailed behavior may evolve during the 0.11.x line as the tooling API is refined. Consumers that depend on them should pin the package version and review release notes.

**Internal** modules are implementation details. They may still be present in the npm tarball because the CLI or retained public modules use them, but they are not package exports and must not be imported by consumers.

Because Metaproject is pre-1.0, the 0.12 release may revise stable 0.11 APIs with documented release notes.

## Public package entry points

| Import | Level | Purpose |
| --- | --- | --- |
| `metaproject/components` | Stable | Browser Web Component primitives, resource context, semantic actions, and `configureMetaproject`. |
| `metaproject/data-source` | Stable | REST client, scoped data runtime, cache/invalidation, and operation invocation helpers. |
| `metaproject/compiler` | Experimental | Parse/analyze HTML-first component source and compile component modules. |
| `metaproject/compiler/browser` | Experimental | Define component source directly in a browser/editor environment. |
| `metaproject/vite` | Experimental | Vite plugin and component discovery helpers. |
| `metaproject/openapi` | Experimental | OpenAPI refs, indexing, examples, server/security helpers, and support diagnostics. |
| `metaproject/project` | Experimental | Browser-safe project defaults and API/component project indexing. |

Use imports such as:

```js
import { configureMetaproject } from 'metaproject/components';
import { createRestClient } from 'metaproject/data-source';
```

For tooling:

```js
import { parseComponentSource } from 'metaproject/compiler';
import { validateOpenApiSupport } from 'metaproject/openapi';
import { buildProjectIndex } from 'metaproject/project';
```

## Internal source modules

The following source areas are intentionally not package exports in 0.11:

- `operations`;
- `api`;
- `build`;
- `mock-api` and `mock-api/client`;
- `project/check`;
- `openapi/mutator`;
- `init`;
- `openapi/project-tools`.

Use the CLI for initialization, validation, builds, OpenAPI mutation/import, and direct operation calls instead of importing these implementation modules.

## CLI surface

The supported 0.11 command surface is maintained in the [CLI reference](cli-reference.md) and is regression-checked against `metaproject help`. Use the CLI for initialization, validation, builds, OpenAPI import/mutation, and direct operation calls.

## Root import policy

A root import is intentionally absent:

```js
import * as metaproject from 'metaproject'; // not supported
```

Choose the subpath matching the environment and responsibility instead. This keeps browser code from accidentally depending on filesystem/build tooling and prevents unrelated APIs from becoming coupled through one compatibility surface.
The [Vite example](../examples/vite/) demonstrates the public `metaproject/vite` integration and explains when to prefer it over static `metaproject build` output.
