# Security Policy

## Secrets

- Do not commit `.env`, `.env.local`, API keys, private endpoints, tokens, or key files.
- Do not put provider keys inside extension code.
- Do not expose secrets through frontend responses, debug payloads, browser logs, or README examples.
- Keep raw provider output behind `LLM_DEBUG=true` and avoid sharing debug logs publicly.

## Extension Safety

- Do not add remote JavaScript loading.
- Do not add arbitrary third-party runtime plugin execution.
- Do not add browser permissions unless the feature strictly requires them and the PR explains why.
- Do not add features that send page content externally without clear user-facing documentation and review.

Community extension should happen through source-code pull requests, not runtime plugin loading.

## Reporting Issues

If GitHub security advisories are enabled for the public repository, report security issues privately there. Until then, avoid posting exploitable details publicly; open a minimal issue asking for a private disclosure channel.
