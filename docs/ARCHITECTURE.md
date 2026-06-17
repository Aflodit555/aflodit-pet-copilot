# Architecture

AFlodit Pet Copilot is a Chromium browser extension with two runtime paths: the recommended Background Runtime Beta inside the extension background service worker, and the Local Backend Dev path for development and fallback testing.

## Components

- `extension/`: Manifest V3 extension and injected floating pet UI.
- `extension/content-src/`: Source files for the generated content script.
- `backend/server.js`: Local Express server.
- `backend/src/llm/`: Input normalization, prompt building, provider calls, response normalization, fallback handling, and timing/debug metadata.

## Runtime Flows

Recommended v0.8.1-beta user flow:

```text
web page / selected text / user input
-> extension content script
-> extension background runtime
-> descriptor-defined provider endpoint
-> normalized JSON response
-> pet UI reply, emotion, motion, bubble type
```

Local Backend Dev flow:

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

## Local Backend Runtime

The backend supports:

- `mock`: deterministic local responses with no API key.
- `openai-compatible`: `/v1/chat/completions`-style providers.

Provider keys stay in the backend environment for this path.

## Background Runtime Beta

`extension/background.js` hosts the Background Runtime Beta path. It provides:

- `runtime:getStatus`
- `settings:getPublic`
- `settings:savePublic`
- `settings:saveSecret`
- `settings:clearKey`

The background runtime has a provider registry for `Mock`, `OpenAI`, `DeepSeek`, `Alibaba Bailian / DashScope`, `OpenRouter`, and a restricted `Custom OpenAI-compatible` advanced entry. Preset provider descriptors contain provider origins inside `extension/runtime/providerRegistry.js`. Custom Provider accepts only a validated HTTPS Base URL and is normalized to `/chat/completions`; it rejects localhost, private network hosts, URL credentials, query strings, hashes, custom headers, custom request bodies, and custom endpoint paths. The release safety field `requestEnabled` remains `false`; real requests are still gated by runtime mode, provider registry, saved Runtime Key, exact optional host permission, and explicit user action.

AI Settings / Model & Key can save public runtime settings (`provider`, `model`, `saveMode`, `debugEnabled`, `runtimeMode`, and restricted `customProvider` metadata) and provider-specific Runtime Keys. In user mode it exposes one Save & Connect action for the Background Runtime Beta setup path with Alibaba Bailian / DashScope `qwen-plus` as the recommended provider/model. That explicit user action saves settings, requests exact host permission when needed, checks readiness, and runs the lightweight provider test. Developer-only tools are gated behind the setup panel's Developer Tools toggle. Background Runtime Beta supports DeepSeek, Alibaba Bailian / DashScope, OpenAI, OpenRouter, and a configured Custom OpenAI-compatible HTTPS endpoint.

The content script never receives full Runtime Keys and cannot pass arbitrary provider URLs, headers, raw request bodies, API keys, tokens, custom endpoint paths, or custom request configuration to the background runtime. The only content-provided custom network field allowed by `settings:savePublic` is the restricted Custom Provider Base URL, which is normalized and validated by the background runtime before storage or permission requests.

## Fallbacks And Debug

The runtime normalizes unsafe provider output and returns safe fallback responses on provider errors, timeouts, malformed JSON, or invalid fields.

Detailed debug metadata is generated internally but exposed in API responses only when `LLM_DEBUG=true`. API keys and authorization headers must never be logged or returned.
