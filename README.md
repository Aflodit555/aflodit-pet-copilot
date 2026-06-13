# AFlodit Pet Copilot

## Status: v0.8.0-beta

AFlodit Pet Copilot is a Chromium browser extension that adds a floating AI pet assistant to web pages. It can chat, explain selected text, translate or polish selected text, and summarize readable page content.

The recommended v0.8.0-beta path is **Background Runtime Beta** with **Alibaba Bailian / DashScope** and model ID `qwen-plus`. This path runs from the extension background service worker and does not require the local Node backend.

DeepSeek, OpenAI, and OpenRouter remain experimental until manually verified for your account, region, and model access. Local Backend Dev remains available for development and fallback testing, but it is not the recommended user path for this beta release.

## Recommended Setup

1. Build or download the release package.
2. Load `dist/aflodit-pet-copilot-v0.8.0/` as an unpacked Chromium extension.
3. Open the pet settings menu and choose `AI Settings / Model & Key`.
4. Keep `Alibaba Bailian / DashScope (Recommended)` selected.
5. Keep or enter model ID `qwen-plus`.
6. Save your DashScope Runtime Key.
7. Click **Save & Connect**.
8. Approve the exact DashScope host permission when the browser asks.
9. Wait for the Connection Status card to show Connected.
10. Use Chat, Explain, Translate, and Summarize from the pet UI.

## Install From Release Package

Build the package:

```powershell
node extension\build-content.js
node scripts\buildReleasePackage.js
node scripts\checkReleasePackage.js
```

Load it in a Chromium browser:

1. Open `chrome://extensions`, `edge://extensions`, or the equivalent page.
2. Enable Developer mode.
3. Choose **Load unpacked**.
4. Select:

```text
dist/aflodit-pet-copilot-v0.8.0/
```

For source development, load `extension/` instead.

## Provider Support

Recommended:

- Alibaba Bailian / DashScope: `qwen-plus`

Experimental:

- DeepSeek: `deepseek-chat`
- OpenAI: `gpt-4o-mini`
- OpenRouter: `openai/gpt-4o-mini`

The extension uses descriptor-defined provider hosts only. It does not support custom endpoints in the release UI and does not request wildcard host permissions.

## Security Notes

- The content script never receives the full Runtime Key.
- The content script cannot pass provider URLs, headers, request bodies, API keys, base URLs, or custom endpoints to the background runtime.
- Runtime Keys are stored by the extension background secret store.
- Optional host permissions are exact provider origins, not `https://*/*`; the normal setup flow requests them only after **Save & Connect** is clicked.
- Authorization headers and full API keys must not be logged or returned in diagnostics.
- Background Runtime failures do not silently fall back to Local Backend.

## Usage

The pet UI supports:

- Chat: answer typed user input.
- Explain: explain selected page text.
- Translate: translate or polish selected page text into Simplified Chinese.
- Summarize: summarize readable page content.

Request payloads use this stable shape internally and at the local backend boundary:

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

Normalized responses use:

```json
{
  "reply": "string",
  "emotion": "neutral",
  "motion": "idle",
  "bubble_type": "normal",
  "confidence": 0.7
}
```

## Local Backend Dev

The local backend is still available for development and compatibility testing:

```powershell
cd backend
copy .env.example .env
npm install
npm start
```

The extension can call:

```text
POST http://127.0.0.1:3001/api/pet
```

Configure `backend/.env` for mock mode:

```env
MODEL_PROVIDER=mock
MODEL_NAME=mock
LLM_DEBUG=false
```

Configure an OpenAI-compatible backend provider:

```env
MODEL_PROVIDER=openai-compatible
MODEL_BASE_URL=https://provider.example.com/v1
MODEL_API_KEY=replace-with-your-key
MODEL_NAME=provider-model-id
MODEL_TIMEOUT_MS=20000
MODEL_TEMPERATURE=0.3
MODEL_MAX_TOKENS=512
LLM_DEBUG=false
```

Do not commit `.env` or real keys.

## Troubleshooting

- Missing key: save a Runtime Key for the selected provider in `AI Settings / Model & Key`.
- Missing permission: click **Save & Connect** again and approve the browser permission prompt.
- Connection failed: confirm provider, model ID, Runtime Key, provider quota, model access, account region, and key validity.
- No pet UI: reload the extension and refresh the page.
- Local Backend Dev errors: confirm the backend is running on `127.0.0.1:3001`.

## Release Package

The release package is generated at:

```text
dist/aflodit-pet-copilot-v0.8.0/
```

It should contain the extension runtime files only: manifest, background script, generated content script, CSS, and required `runtime/` modules. It should not include backend code, source-only content fragments, tests, docs, `.env` files, or task files.

`dist/` is intentionally ignored by git.

## Validation

Recommended release checks:

```powershell
node --check extension\content.js
node --check extension\background.js
node extension\runtime\testRuntimeSetupReleaseCandidate.js
node extension\runtime\testMultiProviderRuntime.js
node extension\runtime\testReleaseSafetyGuard.js
node extension\runtime\checkReleaseSafety.js
node scripts\buildReleasePackage.js
node scripts\checkReleasePackage.js
```

Manual Chromium testing is still required before publishing a release.
