# `metaproject.yaml` configuration

`metaproject.yaml` is the canonical configuration file for a Metaproject project. The machine-readable contract is shipped as `project/metaproject.schema.json`.

Both `metaproject check` and `metaproject build` validate this file before reading the OpenAPI contract or generating output. Unknown top-level fields and unknown fields inside `components` or `build` are rejected so misspellings cannot silently change build behavior.

## Canonical configuration

A complete configuration using every supported 0.11 option is:

```yaml
version: 1
name: Example
scope: example
openapi: openapi.yaml

components:
  source: components
  output: public/components
  output_api: public/components/api.js

build:
  minify: false
  sourcemap: false
```

Only `version` is required. The other fields have defaults where noted below.

## Top-level fields

| Field | Type | Default | Meaning |
| --- | --- | --- | --- |
| `version` | integer | required | Configuration schema version. 0.11 supports only `1`. |
| `name` | non-empty string | none | Human-readable project name. |
| `scope` | string | `default` | Runtime/API scope. Must start with a lowercase letter and contain only lowercase letters, numbers, `.`, `_`, or `-`. Independently distributed projects should choose unique scopes. |
| `openapi` | non-empty string | `openapi.yaml` | Project-relative path to the root OpenAPI document. |
| `components` | object | defaults below | Component source and output paths. |
| `build` | object | defaults below | Static build options. |

## `components`

| Field | Type | Default | Meaning |
| --- | --- | --- | --- |
| `components.source` | non-empty string | `components` | Project-relative directory containing component source. |
| `components.output` | non-empty string | `public/components` | Project-relative generated browser output directory. |
| `components.output_api` | non-empty string | `<components.output>/api.js` | Output path used by the generated API metadata module/build API result. |

Paths must stay inside the project root. Escaping the root with an absolute path or `..` is rejected when the path is resolved.

## `build`

| Field | Type | Default | Meaning |
| --- | --- | --- | --- |
| `build.minify` | boolean | `false` | Minify generated browser bundles. The CLI `--minify` flag overrides the configured false/default value for that invocation. |
| `build.sourcemap` | boolean | `false` | Generate source maps. The CLI `--sourcemap` flag overrides the configured false/default value for that invocation. |


## Validation errors

Configuration errors include the field path. For example:

```text
Invalid metaproject.yaml configuration:
  - components.soruce: unknown configuration field. Supported fields: source, output, output_api.
```

Fix the configuration and rerun `npx metaproject check` before building.
