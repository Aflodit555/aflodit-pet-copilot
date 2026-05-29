# AFlodit Pet Copilot

AFlodit Pet Copilot is a lightweight browser pet assistant extension. It injects a floating pet UI into web pages, reads user chat, selected text, and page context, then sends requests to a local Node.js backend at `POST /api/pet`.

Current target: `v0.6.3 Experimental Streaming Response`. The backend uses a local/provider LLM runtime implemented in this repository. Dify is no longer required at runtime; mentions of Dify are migration history only.

## Project Layout

- `extension/`: Manifest V3 browser extension, content script, and pet UI styles.
- `backend/`: Local Express backend and model runtime.
- `backend/src/llm/`: Input normalization, action-specific prompt building, provider calls, response normalization, timing/debug metadata, and fallbacks.

## Quick Start: Mock Mode

Mock mode needs no API key and is the recommended first run.

```bash
cd backend
npm install
copy .env.example .env
npm run dev
```

Keep `MODEL_PROVIDER=mock` in `.env`.

The backend listens on `http://127.0.0.1:3001` by default. The extension calls:

```text
http://127.0.0.1:3001/api/pet
```

When `CONFIG.streamEnabled` is enabled in the extension, actions first try the experimental streaming endpoint:

```text
http://127.0.0.1:3001/api/pet-stream
```

If streaming fails, the extension falls back to the stable `POST /api/pet` path.

## Runtime Status

Check safe runtime status:

```text
GET http://127.0.0.1:3001/api/runtime-status
```

Aliases:

```text
GET http://127.0.0.1:3001/api/health
GET http://127.0.0.1:3001/health
```

The status response includes version, runtime name/type, provider name, configured model name, optional response format, safe base URL info, whether required config appears present, `LLM_DEBUG`, timeout, uptime, timestamp, backend status, and supported actions. It does not expose API keys or authorization headers.

## OpenAI-Compatible Mode

Set these values in `backend/.env`:

```env
MODEL_PROVIDER=openai-compatible
MODEL_BASE_URL=https://provider.example.com/v1
MODEL_API_KEY=your_api_key_here
MODEL_NAME=your_model_name
MODEL_TIMEOUT_MS=20000
MODEL_TEMPERATURE=0.3
MODEL_MAX_TOKENS=512
MODEL_RESPONSE_FORMAT=
LLM_DEBUG=false
```

`MODEL_BASE_URL` may point to either `/v1` or `/v1/chat/completions`. API keys stay in the local backend and are never stored in extension code.

Optional: set `MODEL_RESPONSE_FORMAT=json_object` only if your OpenAI-compatible provider supports `response_format: { "type": "json_object" }`. It is disabled by default.

## Debug Logging

Set this only for local debugging:

```env
LLM_DEBUG=true
```

When enabled, terminal logs include normalized request previews, input lengths, truncation flags, prompt previews, prompt character counts, raw model response preview, raw response length, JSON parse result, fallback/normalization result, timing fields, and final frontend response. Long text is truncated. Secrets, API keys, local tokens, and authorization headers are not logged.

When `LLM_DEBUG=false`, logs stay quiet except startup and meaningful errors.

## Load The Extension

1. Open your Chromium extension manager.
2. Enable developer mode.
3. Load unpacked extension from `extension/`.
4. Start the backend with `npm run dev` from `backend/`.
5. Open a normal webpage and click the floating pet.

## API Contract

`POST /api/pet` is the stable non-streaming endpoint and accepts the existing snake_case payload:

```json
{
  "action": "chat",
  "user_text": "",
  "selected_text": "",
  "page_title": "",
  "page_url": "",
  "page_text_snippet": "",
  "character_state": ""
}
```

Supported canonical actions:

- `chat`
- `explain_selection`
- `summarize_page`
- `translate`

The response keeps the frontend-compatible shape:

```json
{
  "reply": "string",
  "emotion": "neutral",
  "motion": "idle",
  "bubble_type": "normal",
  "confidence": 0.7
}
```

Allowed enum values:

- `emotion`: `neutral`, `happy`, `thinking`, `confused`, `error`
- `motion`: `idle`, `nod`, `shake`, `jump`, `think`
- `bubble_type`: `normal`, `info`, `warning`, `error`

## Experimental Streaming

`POST /api/pet-stream` is experimental in `v0.6.3`. It keeps the same request payload as `/api/pet`, but returns newline-delimited JSON events over the response body so a Manifest V3 content script can consume it with `fetch()` and `ReadableStream`.

Event format:

```json
{ "type": "start", "action": "translate" }
{ "type": "delta", "text": "partial reply text" }
{ "type": "final", "data": { "reply": "complete reply", "emotion": "thinking", "motion": "think", "bubble_type": "info", "confidence": 0.75 } }
{ "type": "error", "data": { "reply": "模型暂时没有返回有效结果。", "emotion": "error", "motion": "shake", "bubble_type": "error", "confidence": 0.3 } }
```

The stream sends only user-facing reply text in `delta` events. Raw JSON model output is not streamed to users. At the end, the backend builds a complete response object, runs it through the existing response normalizer via JSON serialization, and sends that validated object in the `final` event. Metadata is applied only after the final event.

For OpenAI-compatible providers, streaming uses `stream: true` and parses `data:` chunks from `/v1/chat/completions`, ignoring `[DONE]` and accumulating `choices[0].delta.content`. Mock mode also streams deterministic chunks without an API key.

## Failure Behavior

- Missing selected text for `explain_selection`: `请先选中需要解释的网页文本。`
- Missing selected text for `translate`: `请先选中需要翻译的网页文本。`
- Missing page text for `summarize_page`: `当前页面内容不足，无法可靠总结。`
- Model/provider failure: `模型暂时没有返回有效结果，请稍后再试。`

The normalizer handles plain JSON, Markdown-wrapped JSON, extra text around JSON, missing fields, invalid enums, invalid confidence, empty replies, non-JSON output, malformed JSON, provider errors, and timeouts without breaking the extension response contract.

## Latency Notes

v0.6.3 keeps the stable frontend response contract unchanged for `/api/pet` and adds an isolated experimental streaming path. The prompt slimming from `v0.6.2` remains: prompts use a compact base system prompt plus only the active action instruction for `chat`, `explain_selection`, `translate`, or `summarize_page`.

Runtime debug metadata includes:

- `timing.totalMs`
- `timing.inputNormalizeMs`
- `timing.promptBuildMs`
- `timing.fallbackMs`
- `timing.providerRoundTripMs`
- `timing.providerReadBodyMs` when available
- `timing.responseNormalizeMs`
- `metrics.systemPromptChars`
- `metrics.userPromptChars`
- `metrics.rawModelTextChars`
- `metrics.inputLengths`

Streaming debug metadata is emitted only when `LLM_DEBUG=true` and may include:

- `timing.timeToFirstDeltaMs`
- `timing.streamTotalMs`
- `timing.providerStreamMs`
- `timing.finalNormalizeMs`
- `metrics.deltaCount`
- `metrics.replyChars`

## Validation

Run syntax checks from `backend/`:

```bash
node --check server.js
node --check src/llm/index.js
node --check src/llm/modelClient.js
node --check src/llm/promptBuilder.js
node --check src/llm/responseNormalizer.js
node --check src/llm/fallbackResponse.js
node --check src/llm/inputNormalizer.js
node --check ../extension/content.js
```

Existing mock-mode tests are available:

```bash
npm run test:normalizer
npm run test:input
npm run test:llm
```

## Troubleshooting

- If the extension cannot connect, confirm the backend is running on `127.0.0.1:3001`.
- If requests are rejected, confirm `LOCAL_CLIENT_TOKEN` in `.env` matches the token in the extension config.
- If real-model calls fail, check `/api/runtime-status` for missing `MODEL_BASE_URL`, `MODEL_API_KEY`, or `MODEL_NAME`.
- If debugging provider output, enable `LLM_DEBUG=true` temporarily and keep logs private.

## Known Limitations

- The local backend is required while using the extension.
- This backend is not production hardened.
- Provider compatibility depends on the provider's OpenAI-compatible `/chat/completions` behavior.
- Page extraction quality depends on the current extension extraction logic.
