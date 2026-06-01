# Future @Command Design

`@Command` support is a source-level extension point for local shortcut behavior. It is not a runtime plugin system.

v0.6.5 keeps command definitions centralized under `extension/content-src/commands/` and builds them into `extension/content.js` through the explicit allowlist in `extension/build-content.js`.

Current built-in commands are intentionally small:

- `@选区` / `@selection`: include selected text in the next chat request.
- `@页面` / `@page`: include readable page text in the next chat request.
- `@陪读` / `@reading` / `@read`: enter the existing local reading mode.
- `@退出陪读` / `@exit_reading` / `@normal`: exit reading mode.

## Principles

- Commands must be registered explicitly in source code.
- Commands are added through pull requests with tests and docs.
- Runtime third-party JavaScript plugins are not allowed.
- Remote code loading is not allowed.
- Disabled commands must not execute.
- Unknown commands should fail locally and safely.

## Command Shape

```json
{
  "id": "reading",
  "aliases": ["@陪读", "@reading"],
  "description": "Enter reading companion mode",
  "inputMode": "local",
  "contextMode": "none",
  "handler": {
    "type": "local_action",
    "action": "enter_reading"
  },
  "enabled": true
}
```

Every command must define `id`, `aliases`, `description`, `inputMode`, `contextMode`, and `handler`. Aliases are normalized and must be unique across all registered commands.

## Contribution Flow

1. Add or update an explicit command definition.
2. Add a handler in the appropriate source module.
3. Add parser, registry, and handler tests.
4. Update command and user-facing docs.
5. Add the command source to the explicit build order if a new file is required.
6. Submit a focused PR.

Do not combine command additions with unrelated UI rewrites, backend migrations, settings APIs, or Native Messaging changes.

## Parser Result Shape

Matched command:

```json
{
  "matched": true,
  "executable": true,
  "command": { "id": "sample" },
  "args": "remaining text",
  "reason": "matched_alias"
}
```

Unknown command:

```json
{
  "matched": false,
  "executable": false,
  "command": null,
  "args": "remaining text",
  "reason": "unknown_command"
}
```
