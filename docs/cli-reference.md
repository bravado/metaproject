# CLI reference

The public 0.11 command is `metaproject`. Command examples in the documentation use that executable name.

When Metaproject is installed as a local npm development dependency and `node_modules/.bin` is not already on your shell `PATH`, invoke the same executable with `npm exec -- metaproject ...`.

## Complete command surface

```text
metaproject init [project-root] [--name NAME] [--no-agents]
metaproject check [project-root]
metaproject build [project-root] [--minify] [--sourcemap]
metaproject import-openapi SOURCE [project-root] [--force]
metaproject api list [project-root]
metaproject api show OPERATION [project-root]
metaproject api call OPERATION [project-root] [parameters/options]
metaproject openapi check-examples [project-root]
metaproject openapi upsert-operation --input FILE [project-root]
metaproject openapi upsert-schema --input FILE [project-root]
metaproject --version
```

Run `metaproject help` for the same surface from the installed package.

## Typical project flow

```text
metaproject init
metaproject check
metaproject build
```

To adopt an existing bundled OpenAPI document:

```text
metaproject import-openapi ./docs/openapi.yaml
metaproject check
metaproject build
```

## Calling operations

List the configured operations:

```text
metaproject api list
```

Inspect one operation:

```text
metaproject api show getUser
```

Execute it using OpenAPI parameter names as flags:

```text
metaproject api call getUser --id 123
metaproject api call createUser --body @user.json
```

See [Calling OpenAPI operations from the CLI](api-cli.md) for request bodies, headers, server overrides, authentication, and exit behavior.
