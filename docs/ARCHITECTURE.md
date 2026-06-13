# Architecture

AFlodit Pet Copilot is a browser extension backed by a local Node.js runtime.

## Components

- `extension/`: Manifest V3 extension and injected floating pet UI.
- `extension/content-src/`: Source files for the generated content script.
- `backend/server.js`: Local Express server.
- `backend/src/llm/`: Input normalization, prompt building, provider calls, response normalization, fallback handling, and timing/debug metadata.

## Stable Request Flow

```text
web page / selected text / user input
-> extension content script
-> POST http://127.0.0.1:3001/api/pet
-> local backend LLM runtime
-> normalized JSON response
-> pet UI reply, emotion, motion, bubble type
```

`POST /api/pet` is the stable endpoint. Its request and response contract should remain compatible unless a future task explicitly changes it.

## Experimental Streaming

`POST /api/pet-stream` is experimental. It streams newline-delimited JSON events with reply text deltas and a final normalized object. Events are marked with `streamExperimental: true`.

The stable `/api/pet` path and experimental `/api/pet-stream` path are intentionally separate.

## Runtime

The backend supports:

- `mock`: deterministic local responses with no API key.
- `openai-compatible`: `/v1/chat/completions`-style providers.

Provider keys stay in the backend environment. The extension never calls model providers directly.

## Background Runtime Beta

`extension/background.js` hosts the Background Runtime Beta path for Backendless Beta. It provides:

- `runtime:getStatus`
- `settings:getPublic`
- `settings:savePublic`
- `settings:saveSecret`
- `settings:clearKey`

The background runtime has a provider registry and allowlist for `Mock`, `OpenAI`, `DeepSeek`, `Qwen / DashScope`, and `OpenRouter`. Provider descriptors may contain provider origins inside `extension/runtime/providerRegistry.js`, but the request capability remains disabled with `requestEnabled=false`.

Runtime Setup can save public runtime settings (`provider`, `model`, `saveMode`, `debugEnabled`, `runtimeMode`) and a separate Runtime Key. In user mode it exposes the Backendless Beta setup path. Developer-only tools are gated behind the setup panel's Developer Tools toggle. Background Runtime Beta remains DeepSeek-only, does not add broad host permissions, and does not change Local Backend Dev availability.

## Fallbacks And Debug

The runtime normalizes unsafe provider output and returns safe fallback responses on provider errors, timeouts, malformed JSON, or invalid fields.

Detailed debug metadata is generated internally but exposed in API responses only when `LLM_DEBUG=true`. API keys and authorization headers must never be logged or returned.
