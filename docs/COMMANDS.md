# Future @Command Design

`@Command` support is a planned source-level extension point for local shortcut behavior. It is not a runtime plugin system.

v0.6.5 adds only a minimal parser and registry foundation. It does not implement `@陪读`, full reading companion mode, or any new visible command behavior.

## Principles

- Commands must be registered explicitly in source code.
- Commands are added through pull requests with tests and docs.
- Runtime third-party JavaScript plugins are not allowed.
- Remote code loading is not allowed.
- Disabled commands must not execute.
- Unknown commands should fail locally and safely.

## Proposed Command Shape

```json
{
  "name": "reading",
  "aliases": ["@陪读", "陪读", "@reading"],
  "description": "Enter reading companion mode",
  "requiresSelection": false,
  "requiresPageContext": false,
  "modeTransition": "reading",
  "action": "enter_reading_mode",
  "enabled": true
}
```

In v0.6.5, the built-in reading command definition is future-only and disabled.

## Contribution Flow

1. Add or update an explicit command definition.
2. Add a handler in the appropriate source module.
3. Add parser, registry, and handler tests.
4. Update command and user-facing docs.
5. Submit a focused PR.

Do not combine command additions with unrelated UI rewrites or backend migrations.

## Parser Result Shape

Matched command:

```json
{
  "matched": true,
  "executable": true,
  "command": { "name": "sample" },
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
