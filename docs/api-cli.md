# Calling OpenAPI operations from the CLI

Metaproject includes a small OpenAPI-aware HTTP client. It resolves an `operationId` from the project's configured OpenAPI document and executes it with the same operation metadata and REST client used by generated components.

The CLI is intentionally a thin curl-like layer rather than an API client workspace.

## List operations

```bash
npx metaproject api list
```

Example:

```text
GET     listUsers    /users
POST    createUser   /users
GET     getUser      /users/{id}
PATCH   updateUser   /users/{id}
```

Use `--root DIR` or a positional project root when calling another Metaproject project.

## Inspect one operation

```bash
npx metaproject api show getUser
```

The output includes the method, path, default server, declared parameters, and request-body content types.

## Call an operation

OpenAPI path, query, and header parameters become CLI flags using their declared names:

```bash
npx metaproject api call getUser --id 123
npx metaproject api call listUsers --page 2 --limit 20
```

Repeated flags are passed as arrays, which is useful for array query parameters:

```bash
npx metaproject api call searchUsers --tag admin --tag active
```

If an OpenAPI parameter name conflicts with a CLI option, use `--param NAME=VALUE`:

```bash
npx metaproject api call example --param server=production
```

## Request bodies

For operations with a request body:

```bash
npx metaproject api call createUser \
  --body '{"name":"Ada","email":"ada@example.com"}'
```

Read from a file:

```bash
npx metaproject api call createUser --body @user.json
```

Or stdin:

```bash
cat user.json | npx metaproject api call createUser --body -
```

JSON bodies are validated before the request is sent. The first declared OpenAPI request content type is used as `Content-Type` unless a header override is supplied.

## Servers

By default the CLI uses the first resolved top-level OpenAPI `servers` entry, consistent with the generated browser runtime.

A command-line HTTP client needs an absolute URL. If the OpenAPI server is relative, such as `/api`, override it:

```bash
npx metaproject api call listUsers \
  --server http://localhost:3000/api
```

The CLI does not introduce another API-root setting in `metaproject.yaml`.

## Headers

Add arbitrary headers with curl-style `-H`:

```bash
npx metaproject api call listUsers \
  -H 'Authorization: Bearer token'
```

OpenAPI-declared header parameters can also be supplied through their generated parameter flags.

## Response handling

By default only the response body is written to stdout, so the command composes naturally with tools such as `jq`:

```bash
npx metaproject api call listUsers | jq '.items[]'
```

Useful options:

```text
-i, --include       include HTTP status and response headers
-o, --output FILE   write the rendered response to a file
-v, --verbose       print request/response summary to stderr
```

JSON is pretty-printed when stdout is an interactive terminal and compact when piped.

## Exit codes

```text
0  successful HTTP response
1  project/configuration/CLI error
2  invalid or missing operation input
3  network/transport error
4  HTTP non-2xx response
```

For HTTP errors, the response body is still written to stdout when one exists.
