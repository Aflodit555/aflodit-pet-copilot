# AFlodit Pet Copilot

AFlodit Pet Copilot is a lightweight browser pet assistant extension. It injects a floating pet UI into web pages, reads user chat, selected text, and page context, then sends requests to a local Node.js backend at `POST /api/pet`.

Version target: `v0.6.0 Difyless Runtime`. Runtime LLM processing now lives inside this repository, so Dify is no longer required for local use.

## Project Layout

- `extension/`: Manifest V3 browser extension, content script, and pet UI styles.
- `backend/`: Local Express backend and internal LLM runtime.
- `backend/src/llm/`: Input normalization, prompt building, provider calls, response normalization, and fallbacks.

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
LLM_DEBUG=false
```

`MODEL_BASE_URL` may point to either `/v1` or `/v1/chat/completions`. API keys stay in the local backend and are never stored in extension code.

## Load The Extension

1. Open your Chromium extension manager.
2. Enable developer mode.
3. Load unpacked extension from `extension/`.
4. Start the backend with `npm run dev` from `backend/`.
5. Open a normal webpage and click the floating pet.

## API Contract

`POST /api/pet` accepts the existing snake_case payload:

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

## Runtime Behavior

- Missing selected text for `explain_selection`: `请先选中需要解释的网页文本。`
- Missing selected text for `translate`: `请先选中需要翻译的网页文本。`
- Missing page text for `summarize_page`: `当前页面内容不足，无法可靠总结。`
- Provider failure: `模型暂时没有返回有效结果。`

The normalizer handles plain JSON, Markdown-wrapped JSON, extra text around JSON, missing fields, invalid enums, invalid confidence, empty replies, and provider errors.

## Validation

Run syntax checks and mock-mode tests from `backend/`:

```bash
node --check server.js
node --check src/llm/index.js
node --check src/llm/modelClient.js
node --check src/llm/promptBuilder.js
node --check src/llm/responseNormalizer.js
node --check src/llm/fallbackResponse.js
node --check src/llm/inputNormalizer.js
node scripts/testResponseNormalizer.js
node scripts/testInputNormalizer.js
node scripts/testLlmRuntime.js
npm run test:normalizer
npm run test:input
npm run test:llm
```

## Troubleshooting

- If the extension cannot connect, confirm the backend is running on `127.0.0.1:3001`.
- If requests are rejected, confirm `LOCAL_CLIENT_TOKEN` in `.env` matches the token in the extension config.
- If real-model calls fail, check `MODEL_BASE_URL`, `MODEL_API_KEY`, and `MODEL_NAME`.
- Set `LLM_DEBUG=true` only for local debugging. Raw model output may be returned in debug metadata.

## Known Limitations

- The local backend is required while using the extension.
- This backend is not production hardened.
- Provider compatibility depends on the provider's OpenAI-compatible `/chat/completions` behavior.
- Page extraction quality depends on the current extension extraction logic.
