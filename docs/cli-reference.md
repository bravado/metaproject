# CLI reference

The public 0.11 command is `metaproject`. Command examples in the documentation use that executable name.

Use `npx metaproject ...` to run the project-local executable without requiring a global installation.

## Complete command surface

```text
npx metaproject init [project-root] [--name NAME] [--no-agents]
npx metaproject check [project-root]
npx metaproject build [project-root] [--minify] [--sourcemap]
npx metaproject import-openapi SOURCE [project-root] [--force]
npx metaproject api list [project-root]
npx metaproject api show OPERATION [project-root]
npx metaproject api call OPERATION [project-root] [parameters/options]
npx metaproject openapi check-examples [project-root]
npx metaproject openapi upsert-operation --input FILE [project-root]
npx metaproject openapi upsert-schema --input FILE [project-root]
npx metaproject --version
```

Run `metaproject help` for the same surface from the installed package.

## Typical project flow

```text
npx metaproject init
npx metaproject check
npx metaproject build
```

To adopt an existing bundled OpenAPI document:

```text
npx metaproject import-openapi ./docs/openapi.yaml
npx metaproject check
npx metaproject build
```

## Calling operations

List the configured operations:

```text
npx metaproject api list
```

Inspect one operation:

```text
npx metaproject api show getUser
```

Execute it using OpenAPI parameter names as flags:

```text
npx metaproject api call getUser --id 123
npx metaproject api call createUser --body @user.json
```

See [Calling OpenAPI operations from the CLI](api-cli.md) for request bodies, headers, server overrides, authentication, and exit behavior.
