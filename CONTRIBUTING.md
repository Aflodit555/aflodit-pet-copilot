# Contributing

Thanks for helping improve AFlodit Pet Copilot. Keep changes focused, reviewable, and aligned with the browser-extension plus local-backend architecture.

## Local Setup

```bash
cd backend
npm install
copy .env.example .env
npm run dev
```

Mock mode is the default and needs no API key. Keep provider keys in `backend/.env`, never in extension code.

Load the extension from `extension/` using your Chromium extension manager's unpacked-extension flow.

## Checks

Run backend checks before opening a PR:

```bash
node --check backend/server.js
node --check backend/src/llm/index.js
node --check backend/src/llm/modelClient.js
node --check backend/src/llm/providers/openaiCompatibleProvider.js
node --check backend/src/llm/providers/mockProvider.js
cmd /c npm --prefix backend test
```

If you edit generated extension content, rebuild it:

```bash
node extension/build-content.js
```

## Proposing Features

Open a focused issue or PR that explains the user problem, behavior change, validation plan, and any privacy impact. Avoid large unrelated rewrites in one PR.

Future `@Command` contributions should be submitted as source-code PRs: add an explicit command definition, handler, tests, and docs. Runtime third-party JavaScript plugins are not allowed.

Do not implement new commands by sending arbitrary page content externally without clear documentation, review, and user-facing behavior.
