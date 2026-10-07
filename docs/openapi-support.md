# OpenAPI support in 0.11

Metaproject Core supports a deliberate subset of OpenAPI 3.0 and 3.1. This document is the compatibility boundary for the 0.11 release.

`metaproject check` reports two kinds of support diagnostics:

- **error** — Core cannot interpret or serialize the construct deterministically. The normal project/build context rejects it.
- **warning** — Core can use the contract, but only with the limitation documented below. Warnings do not block a build.

This is a Core compatibility check, not a replacement for a full OpenAPI specification validator.

## Support matrix

| OpenAPI feature | Status | 0.11 behavior |
| --- | --- | --- |
| OpenAPI 3.0.x | **Supported** | Paths, operations, schemas, servers, security metadata, examples, and local refs are supported within the subset below. |
| OpenAPI 3.1.x | **Supported** | Same Core subset as 3.0.x. JSON Schema features outside the rows below are not automatically interpreted by UI primitives. |
| Paths + HTTP operations | **Supported** | `get`, `put`, `post`, `delete`, `options`, `head`, `patch`, and `trace` are indexed. |
| `operationId` | **Supported / required** | Every operation used by Core must have a unique `operationId`; `metaproject check` reports missing/duplicate IDs. |
| Path/query/header parameters | **Supported** | Scalar parameters and arrays using Core's supported default serialization are mapped into the generated REST client. |
| Parameter `style` / `explode` | **Partially supported** | Query uses `form` + `explode=true`; path/header use `simple` + `explode=false`. Equivalent defaults are supported. Other serialization is an error. |
| `deepObject` | **Unsupported** | Object/deep query serialization is not implemented and is an error. |
| Cookie parameters | **Unsupported** | Operation parameters with `in: cookie` are not generated and are an error. |
| JSON request bodies | **Supported** | `application/json` and JSON-like media types are encoded as JSON. |
| `application/x-www-form-urlencoded` | **Partially supported** | Flat scalar object bodies are encoded with `URLSearchParams`. Nested values and OpenAPI `encoding` rules are not interpreted. |
| `multipart/form-data` | **Unsupported** | Contract-driven component operations do not construct multipart bodies. Use a custom/manual transport outside this contract path. |
| Other request media types | **Partially supported** | Native/string bodies can pass through, but Core does not encode plain objects for non-JSON media types. |
| Response schemas | **Supported** | Success response schemas are exposed to generated components/resource context. |
| Response examples | **Supported / required for preview** | Every 2xx response with content needs a representative example for the preferred media type. |
| Multiple request media types | **Partially supported** | Core prefers a JSON media type, otherwise the first declaration; it does not perform request content negotiation. |
| Multiple response media types | **Partially supported** | HTTP response parsing follows the actual response content type, while schema/example tooling prefers `application/json`, otherwise the first declaration. |
| `components.schemas` | **Supported** | Direct object/array/scalar schemas and local references are available to tooling and schema-driven components. |
| `allOf` | **Unsupported** | Core does not merge composed schemas; use an explicit flattened schema for 0.11. |
| `oneOf` / `anyOf` | **Unsupported** | Variant selection/discriminators are not interpreted by schema-driven components. |
| OpenAPI 3.0 `nullable: true` | **Partially supported** | Null values transport normally, but Core does not normalize nullable semantics for schema-driven controls. |
| OpenAPI 3.1 null unions | **Partially supported** | `type: [T, "null"]` / null schemas produce the same warning and are not normalized for controls. |
| Local `$ref` | **Supported** | JSON Pointer refs within the root document are resolved where Core needs them. |
| Local external `$ref` | **Supported** | Project-relative YAML/JSON files are resolved during project loading/check/build. |
| Remote HTTP(S) `$ref` | **Unsupported** | Remote refs are rejected. Keep referenced files project-local or bundle the contract before using it. |
| Top-level `servers` + variables | **Supported** | Declaration order and variable defaults/overrides are supported; the generated runtime uses the first resolved top-level server. |
| Path/operation-level `servers` | **Unsupported** | Core does not switch servers per path/operation. |
| Security schemes/requirements | **Supported with transport limits** | API-key header/query, HTTP auth, OAuth2/OpenID bearer tokens, and OR/AND requirements are interpreted by Core helpers. Credential acquisition remains the host's responsibility. |
| Cookie API-key security | **Partially supported** | Returned as transport metadata; browser fetch cannot directly set the `Cookie` header. |
| Mutual TLS | **Partially supported** | Returned as transport metadata and requires a custom/host transport. |
| Callbacks | **Unsupported** | Callback operations are not modeled by Core. |
| Response links | **Unsupported** | OpenAPI Link Objects are not used for component/application navigation. |
| `x-project-id` | **Supported / required by project checks** | Operations and reusable `components.schemas` need stable project IDs for deterministic indexing/relationships. |

## Parameter serialization boundary

Core intentionally supports the simple request shapes generated by HTML component properties and forms:

- query scalar: `?page=2`;
- query array: repeated `?tag=a&tag=b` (OpenAPI `form`, `explode=true`);
- path scalar/array: simple comma-compatible expansion;
- header scalar/array: simple header values.

Object-valued parameters, `deepObject`, space/pipe-delimited query serialization, label/matrix path styles, and non-default array explode behavior are rejected by `metaproject check`.

## References

Local external refs may be split across files:

```yaml
components:
  schemas:
    User:
      $ref: ./schemas.yaml#/User
```

The referenced path is resolved relative to the file containing the ref. HTTP(S) refs are deliberately not fetched during builds so the project remains deterministic and offline-buildable.

## Security boundary

The OpenAPI security helpers describe/apply credentials; generated applications still own credential storage and acquisition. In particular:

- OAuth2/OpenID Connect token acquisition/refresh is not performed by Core;
- cookie API keys cannot be injected as a browser `Cookie` header;
- mutual TLS requires a transport capable of presenting a client certificate.

Use a host-supplied client when application-specific authentication, CSRF, cookies, TLS, signing, or request middleware requires behavior beyond the generated REST client.
