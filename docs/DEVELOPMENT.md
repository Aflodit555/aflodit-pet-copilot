# Development

## Common Commands

Install backend dependencies:

```bash
cd backend
npm install
```

Start the backend:

```bash
cd backend
npm run dev
```

Build generated extension content:

```bash
node extension/build-content.js
```

## Backend Validation

```bash
node --check backend/server.js
node --check backend/src/llm/index.js
node --check backend/src/llm/modelClient.js
node --check backend/src/llm/providers/openaiCompatibleProvider.js
node --check backend/src/llm/providers/mockProvider.js
cmd /c npm --prefix backend test
cmd /c npm --prefix backend run test:llm
```

PowerShell may block `npm.ps1` on some Windows machines. Use `cmd /c npm ...` or `npm.cmd ...` as a workaround.

## Command Foundation Checks

```bash
node --check extension/content-src/commands/commandSchema.js
node --check extension/content-src/commands/builtinCommands.js
node --check extension/content-src/commands/commandParser.js
node --check extension/content-src/commands/commandRegistry.js
node extension/content-src/commands/commandParser.test.js
```

## Manual Verification

- `GET http://127.0.0.1:3001/api/runtime-status` reports the expected version.
- `POST /api/pet` returns the stable response object.
- `POST /api/pet-stream` returns experimental stream events.
- `LLM_DEBUG=false` hides detailed debug metadata in API responses.
- `LLM_DEBUG=true` exposes debug metadata for local troubleshooting.
- Mock mode works without API keys.
- No `.env`, key files, private model folders, logs, or cache files are staged.
