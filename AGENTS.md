# AGENTS.md

## Project Identity

This repository is **AFlodit Pet Copilot**, a browser-based AI pet assistant extension.

It is not the Live2D runtime project.
Do not introduce Live2D, VTube Studio, VTS WebSocket, parameter bridge, performance planner, TTS, mouth-open driver, or model parameter runtime code unless a future task explicitly asks for it.

The current project is a browser extension plus a local backend. Its core loop is:

```text
Web page / selected text / user input
-> browser extension frontend
-> local backend `/api/pet`
-> LLM runtime
-> structured JSON response
-> pet UI expression / bubble / motion rendering
```

## Main Migration Goal

Migrate the project away from Dify runtime dependency.

The old Dify workflow responsibilities should be replaced by code inside this repository:

- input normalization
- prompt building
- model API calling
- JSON extraction
- JSON schema normalization
- fallback response generation
- debug tracing

After migration, community users should be able to clone this repository, configure their own model API through `.env`, and run the project without importing a Dify workflow.

## Do Not Rewrite the Whole Project

Preserve the existing browser extension behavior as much as possible.

Do not casually rewrite:

- `manifest.json`
- `content.js`
- `pet.css`
- current floating pet UI behavior
- current three action bubbles
- current chat panel behavior
- current selected-text handling
- current page-context extraction behavior
- current local backend route shape

Refactor only where it supports the Difyless migration or improves maintainability without changing visible behavior.

## Runtime Boundary

The browser extension frontend should not call model APIs directly.

Model API keys must stay in the local backend only.

Preferred flow:

```text
content.js
-> http://127.0.0.1:3001/api/pet
-> server.js
-> src/llm/*
-> model provider
-> response normalizer
-> frontend JSON response
```

Keep the frontend/backend boundary stable.

## Local Backend Route

The existing backend API path should remain compatible.

Preferred route:

```text
POST /api/pet
```

If the current project already supports another route, keep backward compatibility unless the task explicitly asks to remove it.

Do not rename routes casually.

## Input Schema

External request fields should stay in snake_case for compatibility with the existing browser extension and the old Dify input contract:

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

Allowed canonical actions:

```text
chat
explain_selection
summarize_page
translate
```

Action aliases may be accepted only at the backend boundary:

```text
explain -> explain_selection
summarize -> summarize_page
summary -> summarize_page
translate_selection -> translate
```

Do not spread multiple action names across the codebase.

## Internal Naming Policy

External API payloads use snake_case.

Internal JavaScript may use camelCase, but conversion must happen once near the request boundary.

Avoid mixing these randomly across modules:

```text
page_text_snippet
pageTextSnippet
selected_text
selectedText
character_state
characterState
```

Use one internal representation consistently after normalization.

## Text Presence Rules

These rules are critical and must not regress.

If `selected_text.trim()` contains any non-empty character, selected text is present.

If `page_text_snippet.trim()` contains any non-empty character, page content is present.

When selected text is present, never return messages equivalent to:

```text
请先选中
没有选中文本
需要翻译的网页文本
```

When page text is present, do not claim that page content is unavailable.

When both selected text and page text are empty, do not pretend that the assistant has read the page.

## Action Behavior

### chat

Answer `user_text`.

If `selected_text` is non-empty, treat it as explicitly referenced selected content.

If `page_text_snippet` is non-empty, treat it as explicitly referenced page content.

If both are empty, answer as normal chat only.

### explain_selection

Explain `selected_text` in concise Simplified Chinese.

Focus on meaning, key points, and necessary background.

Do not repeat the full original text.

### summarize_page

Summarize `page_text_snippet` in concise Simplified Chinese.

Prioritize topic, key points, and conclusion.

### translate

Translate or polish `selected_text` into natural Simplified Chinese.

Default target is English-to-Chinese.

If the text is mixed-language, preserve necessary proper nouns and translate the foreign-language parts.

If the text is already fully Chinese, do not say it cannot be translated. Say that the original text is already Chinese and provide a more natural polished Chinese version.

Do not explain the translation process.

## LLM Output Schema

The normalized backend response should contain:

```json
{
  "reply": "string",
  "emotion": "neutral",
  "motion": "idle",
  "bubble_type": "normal",
  "confidence": 0.7
}
```

Dify-compatible enum values:

```text
emotion: neutral, happy, thinking, confused, error
motion: idle, nod, shake, jump, think
bubble_type: normal, info, warning, error
```

If the existing frontend supports more UI states, preserve them.

Do not remove existing expressions or motions just because the old Dify prompt had fewer enum values.

## Response Normalizer

Never trust raw model output.

The response normalizer must handle:

- pure JSON object string
- JSON inside Markdown code fences
- extra text before JSON
- extra text after JSON
- missing fields
- wrong field types
- invalid enum values
- invalid confidence
- empty reply
- model timeout
- provider error

The normalizer should return a safe response instead of crashing the backend.

Recommended normalized debug metadata:

```json
{
  "fallbackUsed": false,
  "warnings": [],
  "rawTextAvailable": true
}
```

Raw model output must only be exposed when debug mode explicitly allows it.

## Confidence Policy

Use conservative confidence values.

Rules:

```text
missing confidence -> 0.7
invalid confidence -> 0.7
fallback response -> usually 0.3 to 0.5
normal model response -> usually 0.6 to 0.9
final value must be clamped to [0, 1]
```

Do not force `1.0`.

## Fallback Policy

Fallbacks should be explicit and safe.

For missing selected text:

```text
explain_selection -> 请先选中需要解释的网页文本。
translate -> 请先选中需要翻译的网页文本。
```

For missing page text:

```text
summarize_page -> 当前页面内容不足，无法可靠总结。
```

For model failure:

```json
{
  "reply": "模型暂时没有返回有效结果。",
  "emotion": "error",
  "motion": "idle",
  "bubble_type": "error",
  "confidence": 0.3
}
```

Do not trigger missing-selection fallback when `selected_text` is actually non-empty.

## Text Limit Policy

Centralize text limits in code.

Recommended defaults:

```text
user_text: 1200 chars
selected_text: 3000 chars
page_title: 200 chars
page_url: 500 chars
page_text_snippet: 6000 chars
character_state: 1000 chars
```

Input sanitization should:

- safely convert non-string values to empty strings
- trim whitespace
- normalize excessive whitespace where reasonable
- truncate overlong values
- record truncation metadata for debug tracing

Do not scatter hardcoded thresholds across `content.js`, `server.js`, and LLM modules.

## Suggested Difyless LLM Module Layout

Use this structure unless it conflicts with the existing repository style:

```text
src/
  llm/
    index.js
    modelClient.js
    promptBuilder.js
    responseNormalizer.js
    fallbackResponse.js
    llmSchemas.js
    textLimits.js
    providers/
      mockProvider.js
      openaiCompatibleProvider.js
```

Responsibilities:

```text
promptBuilder.js -> build system/user prompt from normalized input
modelClient.js -> choose provider and call model
mockProvider.js -> deterministic no-key demo provider
openaiCompatibleProvider.js -> OpenAI-compatible chat completions API
responseNormalizer.js -> extract and normalize JSON
fallbackResponse.js -> safe fallback replies
textLimits.js -> centralized input sanitization and truncation
llmSchemas.js -> allowed actions, enums, schema helpers
```

Keep `server.js` thin.

Do not dump long prompts, model provider code, and JSON repair logic directly into `server.js`.

## Model Provider Policy

The runtime should support at least:

```text
mock
openai-compatible
```

### mock

`mock` must run without API keys.

It should support all four actions and return deterministic structured JSON.

This is important for GitHub demos and first-time local setup.

### openai-compatible

`openai-compatible` should call a standard `/v1/chat/completions`-style API.

Expected environment variables:

```env
MODEL_PROVIDER=mock
MODEL_BASE_URL=
MODEL_API_KEY=
MODEL_NAME=
MODEL_TIMEOUT_MS=20000
MODEL_TEMPERATURE=0.3
MODEL_MAX_TOKENS=512
LLM_DEBUG=false
```

Handle common base URL forms cleanly:

```text
https://provider.example.com/v1
https://provider.example.com/v1/chat/completions
```

Do not expose API keys to frontend responses or debug logs.

## Environment And Secrets

Create or maintain `.env.example` with safe placeholder values.

Never commit real secrets.

`.gitignore` must include:

```gitignore
.env
.env.local
private-models/
*.key
```

Do not commit:

- real API keys
- private model endpoints
- local absolute paths
- personal tokens
- exported private Dify workflow credentials

## Browser Extension Policy

This project is a browser extension.

Respect browser-extension constraints:

- avoid unnecessary permissions
- keep `manifest.json` minimal
- do not put model API keys in extension code
- do not call model providers directly from `content.js`
- keep DOM injection isolated and predictable
- avoid global CSS pollution
- avoid breaking arbitrary web pages
- keep UI z-index and event handling controlled

## UI Policy

Preserve the current pet interaction design unless explicitly asked to change it.

Important UI concepts:

- floating pet avatar
- action bubbles
- chat panel
- selected text display
- reply display
- scrollable long content areas
- stable return-to-smile behavior after actions

Do not redesign the UI during backend migration.

Only add compact debug UI if necessary.

## Page Extraction Policy

Page extraction should prefer useful readable text over raw DOM noise.

Avoid sending huge CSS/script/navigation/sidebar garbage to the model.

Do not rely only on endless blacklists.

Prefer a layered extraction strategy:

```text
selected text first
main/article/readable content when available
visible meaningful text fallback
hard length cap
```

Keep extraction fast enough for browser use.

## Debug Policy

Debug traces should help development but avoid leaking secrets.

Useful fields:

```text
provider
model
action
input lengths
truncation metadata
normalized response
fallbackUsed
warnings
request duration
```

Raw model output should only appear when `LLM_DEBUG=true`.

Never log API keys.

## Testing Policy

Add lightweight Node scripts for new runtime logic.

Recommended scripts:

```text
scripts/testLlmRuntime.js
scripts/testResponseNormalizer.js
```

They must run in mock mode without an API key.

Minimum coverage:

```text
chat with user_text
explain_selection with selected_text
translate with English selected_text
translate with Chinese selected_text
summarize_page with page_text_snippet
invalid action fallback
Markdown-wrapped JSON
extra text around JSON
missing confidence
invalid emotion/motion
missing selected_text fallback
missing page_text_snippet fallback
```

## Validation Commands

Before reporting completion, run applicable checks:

```bash
node --check server.js
node --check content.js
node --check src/llm/index.js
node --check src/llm/modelClient.js
node --check src/llm/promptBuilder.js
node --check src/llm/responseNormalizer.js
node --check src/llm/fallbackResponse.js
node scripts/testResponseNormalizer.js
node scripts/testLlmRuntime.js
```

If file names differ, run equivalent checks and explain the difference.

Do not claim validation passed if it was not actually run.

## README Policy

Update README when runtime behavior changes.

README should include:

- what the extension does
- how the browser extension connects to the local backend
- mock mode quick start
- OpenAI-compatible API configuration
- `.env.example` explanation
- supported actions
- request/response schema
- how to load the extension locally
- how to run the backend
- common troubleshooting

Do not overclaim production readiness.

## Public GitHub Readiness

This repository should look like a clean engineering project, not a private experiment dump.

Before public release, check:

- no secrets
- no private local paths in code or docs
- no unrelated project artifacts
- no Dify-only setup requirement
- clear README
- working mock mode
- stable extension loading steps
- reproducible backend startup

## Reporting Format

When finishing a task, report:

1. Changed files
2. What changed
3. What stayed compatible
4. How to run locally
5. How to validate in mock mode
6. How to configure real model API
7. Validation results
8. Known limitations

Be explicit about anything not tested.
