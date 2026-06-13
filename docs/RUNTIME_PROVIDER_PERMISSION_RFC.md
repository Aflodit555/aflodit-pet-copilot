# Runtime Provider Permission RFC

## 1. Goal

Phase 5A defines the permission strategy for future real provider requests from the extension background runtime. Phase 5B adds a mock-only Test Connection skeleton that exercises the UI and message path without contacting real providers. Phase 5C.0 adds a DeepSeek-only optional host permission status check.

The goals are:

- Define a safe permission boundary before enabling provider adapters.
- Define the security model for a future Test Connection feature.
- Keep Phase 5A as documentation only; it does not implement runtime requests.

Phase 5B does not change the current AI request path. Chat, explain, translate, and summarize continue to use the local backend.

Phase 5C.0 also does not change the current AI request path. It only checks whether the exact DeepSeek optional host permission is already granted. It does not request permission, does not request a model, does not verify provider readiness, and keeps `requestEnabled=false`.

Phase 5C.0.1 fixes the permission status message wire and adds lightweight tests for `runtime:getProviderPermissionStatus`. It also compacts the Backendless Beta UI so Runtime Actions, setup checks, and navigation actions are visually distinct. It still does not request permissions or providers.

Phase 5C.1 adds a DeepSeek-only permission request UI. The background runtime may call `chrome.permissions.request` only for the exact allowlisted origin `https://api.deepseek.com/*`. This does not request a model, does not verify provider readiness, and keeps `requestEnabled=false`. OpenAI, DashScope, and OpenRouter permission requests remain unconfigured.

Phase 5C.2 adds a DeepSeek-only Real Test. The background runtime may send one minimal DeepSeek chat completions request after permission is granted and a Runtime Key exists. This may consume a tiny amount of quota, does not switch Chat/Explain/Translate/Summarize to the background runtime, does not make Background Runtime Beta generic, and keeps `requestEnabled=false`. OpenAI, DashScope, and OpenRouter real tests remain unconfigured.

Phase 6 adds one optional background AI route for Chat only. The content script may send only `providerId`, `model`, and user input to `runtime:chat`; the background runtime reads the Runtime Key internally and calls the allowlisted DeepSeek chat completions endpoint. Normal Chat without the explicit background prefix, plus Explain, Translate, and Summarize, still use the local backend.

Phase 6.1 audits the optional background Chat route. `runtime:chat` accepts only `providerId`, `model`, and `userText`; `userText` must be a trimmed 1-512 character string. Extra fields such as URL, headers, raw body, API key, token, or endpoint are rejected before any provider request is attempted.

Phase 6.2 makes the optional background Chat route a release-gated beta path. The UI labels Local Backend, Background Runtime, Mock Test, Permission Check, and Real Provider Test sources explicitly. Background Chat failures do not automatically fall back to the local backend; users remove `/bg` or `@background` to use ordinary Chat.

Phase 6.3 adds a public `backgroundChatPreviewEnabled` legacy setting and a compact Backendless Beta toggle. The setting defaults to `false`. When enabled, ordinary Chat uses Background Runtime, while `/local` and `@local` force Local Backend Chat. Explain, Translate, and Summarize continue to use the local backend.

Phase 6.4 adds `runtime:getBackgroundChatReadiness` and a compact Backendless Beta checklist. The readiness API checks only local/background state: provider, Runtime Key presence, DeepSeek host permission, model fallback, runtime mode state, and Real Test optional status. It does not call a provider, request permission, run Real Test, expose secrets, or change `requestEnabled`.

Phase 7.0 adds `runtime:action` and renames the legacy setting to `backgroundRuntimePreviewEnabled`. The old `backgroundChatPreviewEnabled` value is still accepted for migration. When Background Runtime Beta is enabled, Chat, Explain, Translate, and Summarize can use the Background Runtime. When it is disabled, ordinary actions remain on the Local Backend except explicit Chat `/bg` or `@background`.

Phase 8.0 replaces the beta checkbox with a public `runtimeMode` selector: `local_backend` or `background_runtime_beta`. `local_backend` is the default. `background_runtime_beta` routes Chat, Explain, Translate, and Summarize to the background runtime after setup. The background runtime remains DeepSeek-only, requires a saved Runtime Key and the exact DeepSeek permission, and still keeps `requestEnabled=false`. Readiness is local-only and does not call the provider, request permission, run Real Test, or change settings. Real Test remains separate.

Phase 9.0 renames the user-facing setup area to Runtime Setup and adds release-candidate setup affordances: a compact setup checklist, explicit setup action order, safe copyable diagnostics, safe `lastRealTestStatus` metadata, and a local release safety guard script. This phase does not expand providers, does not add permissions, does not change routing, and does not make Background Runtime Beta the default.

## 2. Non-goals

Phase 5A through Phase 9.0 does not:

- Make the background runtime the default AI request path.
- Turn Background Runtime Beta into a generic provider runtime.
- Add broad real provider network calls beyond DeepSeek-only Real Test Connection and optional DeepSeek background Chat.
- Add broad host permissions.
- Request optional host permissions at runtime except the DeepSeek-only permission request in Phase 5C.1.
- Support custom endpoints.
- Expose the full Runtime Key or backend API Key to the content script.
- Turn the background runtime into a generic proxy.

## 3. Current Architecture

The stable AI path is still:

```text
content script -> local backend -> provider
```

The Runtime Setup path is currently:

```text
content script -> background runtime settings/secret metadata
content script -> background runtime -> DeepSeek minimal real test
```

The Backendless Beta path stores and reloads public settings, provider allowlist state, masked Runtime Key metadata, a mock Test Connection result, a DeepSeek-only Real Test result, optional DeepSeek background action results, and the `runtimeMode` selector. `runtimeMode=local_backend` keeps ordinary Chat / Explain / Translate / Summarize on the local backend. `runtimeMode=background_runtime_beta` routes those four actions through Background Runtime after setup.

Phase 9.0 adds safe runtime diagnostics with only these user-support fields: version, runtime mode, provider id/name, model, Runtime Key presence, masked key preview, permission status, readiness status, last safe Real Test status, `requestEnabled=false`, and source label support. Diagnostics must not include full Runtime Keys, Authorization headers, raw provider responses, page text, selected text, prompts, headers, or raw request bodies.

In Phase 5C.0, the Backendless Beta path can also ask the background runtime for `runtime:getProviderPermissionStatus` with only `{ "providerId": "deepseek" }`. The background runtime resolves the provider from the allowlist and checks `chrome.permissions.contains` for `https://api.deepseek.com/*`.

In Phase 5C.2, the Backendless Beta path can ask the background runtime for `runtime:testProviderConnection` with only `{ "providerId": "deepseek", "model": "deepseek-chat" }`. The background runtime builds the URL from the DeepSeek descriptor, reads the Runtime Key internally, sends the minimal request, and returns a redacted result with `requestEnabled=false`.

In Phase 6.1, the Backendless Beta path can ask the background runtime for `runtime:chat` with only `{ "providerId": "deepseek", "model": "deepseek-chat", "userText": "hello" }`. It is opt-in from the Chat UI with `/bg ` or `@background ` and does not carry selected text, page text, URLs, headers, raw bodies, or API keys from the content script.

In Phase 6.3, the Chat UI also supports `/local ` and `@local ` as explicit Local Backend overrides. With `backgroundChatPreviewEnabled=false`, ordinary Chat still uses the local backend. With `backgroundChatPreviewEnabled=true`, ordinary Chat uses the same `runtime:chat` readiness guard as `/bg`; it does not auto-request permission or run a real provider test during Chat.

In Phase 6.4, the Backendless Beta path can ask the background runtime for `runtime:getBackgroundChatReadiness` with only `{ "providerId": "deepseek", "model": "deepseek-chat" }`. The response is a safe checklist for UI display and never includes API keys, Authorization headers, URLs from content, raw provider responses, or request bodies.

In Phase 7.0, the Backendless Beta path can ask the background runtime for `runtime:action` with only `providerId`, optional `model`, `action`, `userText`, optional `pageText`, and optional `selectionText`. The background runtime chooses the prompt internally from the action type. Content scripts cannot provide custom prompt templates, URLs, headers, request bodies, or secrets.

In Phase 8.0, the content script saves only the public `runtimeMode` enum. If a stored setting still has `backgroundRuntimePreviewEnabled=true` and no `runtimeMode`, it is migrated to `background_runtime_beta`. If both fields exist, `runtimeMode` wins. The UI allows selecting Background Runtime Beta even when readiness is not ready, but it warns about missing Runtime Key, permission, model, or unsupported provider and keeps Local Backend available.

In Phase 9.0, the UI displays setup state without implying broad provider availability: Runtime Mode, Provider, Model, Runtime Key, Host Permission, Readiness, and Real Test. The user must explicitly save settings, save a key, request permission, check readiness, run Real Test, and select Background Runtime Beta. Real Test status is stored only as safe metadata:

```js
{
  providerId,
  model,
  ok,
  errorCode,
  checkedAt
}
```

No response body, headers, token, Runtime Key, Authorization value, or raw provider response is stored.

## 4. Permission Strategy Options

### A. Static host_permissions

Static host permissions would declare every supported provider origin in `manifest.json`.

Pros:

- Simple runtime behavior after install.
- No permission prompt at Test Connection time.
- Predictable provider allowlist if the list remains small.

Cons:

- Users see broader permissions before they choose a provider.
- Every added provider changes the extension permission surface.
- Not suitable for custom endpoints.

Security implications:

- The manifest must never use `https://*/*`.
- Origins must come from the provider allowlist descriptor.
- The background runtime still must reject content-provided URL, headers, or raw request body fields.

User experience impact:

- Easier setup, but install-time trust cost is higher.

Fit for v0.8.x:

- Acceptable only if optional permissions become too complex, and only with explicit provider origins.

### B. optional_host_permissions

Optional host permissions would request access only when a user enables or tests a specific provider.

Pros:

- Better least-privilege story.
- Users approve the provider they selected.
- Provider allowlist can map directly to required origins.

Cons:

- More UI and state management.
- Test Connection must handle missing, denied, and revoked permissions.
- Some browsers may have inconsistent optional permission UX.

Security implications:

- Optional permissions still must be provider-origin specific.
- The extension must not request arbitrary wildcard access.
- Permission state must be part of `requestEnabled` evaluation.

User experience impact:

- Slightly more setup, but clearer trust boundary.

Fit for v0.8.x:

- Recommended first candidate before real provider requests are enabled.

### C. External backend / native helper

This option keeps provider requests outside the extension background runtime.

Pros:

- Browser extension host permissions stay minimal.
- Existing local backend security model can be reused.
- Provider network behavior remains outside the content script.

Cons:

- Does not complete the Backendless migration.
- Native helper distribution is complex.
- Native Messaging would introduce a larger trust and installation surface.

Security implications:

- Native Messaging must not be auto-installed as part of this migration.
- A helper must not become a generic request proxy.
- Secret handling must remain redacted and local.

User experience impact:

- More moving parts for community users.

Fit for v0.8.x:

- Not preferred for the Backendless path. Keep the local backend as the legacy stable path.

Across all options:

- Do not use `https://*/*`.
- Do not add arbitrary custom endpoint input.
- Do not auto-install Native Messaging.
- Provider origins must come from allowlist descriptors only.

## 5. Recommended Strategy

Recommended strategy for v0.8.x:

```text
Keep provider allowlist plus explicit provider origin policy.
Before real requests are implemented, evaluate optional_host_permissions first.
If optional permissions make the UX or compatibility too complex, consider static exact host_permissions.
Do not support custom endpoints in v0.8.x.
```

Rationale:

- Community setup remains understandable.
- The security boundary is easier to explain and audit.
- The background runtime avoids generic proxy behavior.
- Future implementation cost stays controlled because each provider maps to a known descriptor.

## 6. Test Connection Design

Real Test Connection is implemented only for DeepSeek in Phase 5C.2. Phase 5B only implements a mock Test Connection skeleton.

Rules:

- Test Connection runs only in the trusted background runtime.
- The content script may send only public fields such as `providerId` and `model`.
- The Runtime Key is read only inside the background runtime.
- The request URL is built only from the provider allowlist descriptor.
- Headers are generated only inside the provider adapter.
- The content script must not provide URL, headers, or raw request body fields.
- The response must be minimal and redacted.
- Phase 5B mock Test Connection must not request a real provider.
- Phase 5B mock Test Connection must not set `requestEnabled=true`.
- Phase 5C.2 Real Test Connection must use only the DeepSeek allowlisted origin.
- Phase 5C.2 Real Test Connection must not set `requestEnabled=true`.
- OpenAI, DashScope, and OpenRouter real tests are not configured in Phase 5C.2.

Mock successful response shape:

```json
{
  "ok": true,
  "mode": "mock",
  "providerId": "deepseek",
  "providerName": "DeepSeek",
  "model": "deepseek-chat",
  "hasApiKey": true,
  "requestEnabled": false,
  "latencyMs": 0,
  "message": "Mock runtime test passed. Real provider requests are still disabled."
}
```

Failure response shape:

```json
{
  "ok": false,
  "mode": "mock",
  "providerId": "deepseek",
  "errorCode": "MISSING_RUNTIME_KEY",
  "message": "Runtime key is missing. Save a Runtime Key before testing.",
  "requestEnabled": false
}
```

DeepSeek Real Test successful response shape:

```json
{
  "ok": true,
  "mode": "real-test",
  "providerId": "deepseek",
  "providerName": "DeepSeek",
  "model": "deepseek-chat",
  "permissionGranted": true,
  "hasApiKey": true,
  "latencyMs": 1234,
  "requestEnabled": false,
  "message": "DeepSeek real test passed. Main AI actions still use the local backend."
}
```

Responses must not include:

- Authorization header values.
- Full API keys.
- Full request bodies.
- Raw provider responses.
- Stack traces that contain secret material.

## 6.1 Optional Background Chat Design And Audit

Phase 6 adds `runtime:chat` as the first single-action background AI route. Phase 6.1 tightens its payload and UI behavior. Phase 6.2 adds release-gate source labels and explicit failure UX. Phase 6.3 adds a disabled-by-default Background Chat Beta toggle plus explicit Local Backend overrides. Phase 6.4 adds a read-only readiness checklist before users try Background Chat. Phase 7.0 generalizes the beta path into Background Runtime Beta for Chat, Explain, Translate, and Summarize. Phase 8.0 replaces the checkbox with the Runtime Mode selector and keeps Local Backend as the default. Phase 9.0 productizes the setup UI as Runtime Setup and adds safe diagnostics plus a release safety guard.

Rules:

- With `runtimeMode=local_backend`, ordinary Chat, Explain, Translate, and Summarize use the local backend.
- With `runtimeMode=background_runtime_beta`, ordinary Chat, Explain, Translate, and Summarize use Background Runtime.
- `/bg ` and `@background ` force Background Runtime Chat.
- `/local ` and `@local ` force Local Backend Chat.
- The content script may send only `providerId`, `model`, and `userText` to legacy `runtime:chat`.
- The content script may send only `providerId`, `model`, `action`, `userText`, `pageText`, and `selectionText` to `runtime:action`.
- `runtime:chat` user text must be 1-512 characters; `runtime:action` validates typed text, page text, and selected text with strict per-field limits.
- Any extra payload field returns `INVALID_PAYLOAD`.
- The background runtime reads the Runtime Key only from `secretStore`.
- The URL, headers, and request body are generated inside the background runtime helper.
- The response is normalized to the existing pet UI shape: `reply`, `emotion`, `motion`, `bubble_type`, and `confidence`.
- The Chat input placeholder names `/bg`, `@background`, `/local`, and `@local`.
- Background Runtime output must identify background runtime as the source.
- Local backend results must identify Local Backend as the source.
- Mock Test, Permission Check, and Real Provider Test messages must keep visible labels.
- Background Runtime failures must say the Background Runtime failed and Local Backend remains available.
- Background Runtime Beta failures must tell users to switch Runtime Mode to Local Backend.
- Chat failures in Background Runtime Beta should also mention that `/local` can force Local Backend Chat.
- Explicit `/bg` and `@background` failures must keep the remove-prefix recovery copy.
- Background Chat failures must not trigger automatic fallback to `/api/pet`.
- Readiness checks must not call fetch, request permission, run Real Test, save secrets, or modify provider settings.
- Runtime action failures must not automatically fall back to `/api/pet`.
- `requestEnabled` remains `false`.
- Release safety guard command: `node extension\runtime\checkReleaseSafety.js`.

## 7. Token and Cost Policy

DeepSeek Real Test Connection may consume a tiny amount of provider quota in Phase 5C.2. Mock Test Connection does not consume provider quota.

Recommended rollout:

- Phase 5B: implement mock Test Connection skeleton only. It does not consume tokens.
- Phase 5C.2: implement DeepSeek-only real Test Connection with the smallest practical request.
- If a provider has no safe metadata endpoint, use a minimal chat completion request.
- UI copy must clearly state that a real provider test may consume a small amount of tokens or quota.

## 8. requestEnabled State Machine

`requestEnabled=false` when any of the following is true:

- Provider descriptor has `requestEnabled=false`.
- Required host permission is missing.
- Runtime Key is missing.
- Provider is disabled.
- Latest Test Connection failed.

`requestEnabled=true` only when all of the following are true:

- Provider is enabled.
- Provider descriptor has `requestEnabled=true`.
- Required host permission is granted.
- Runtime Key exists.
- Latest Test Connection passed.

Phase 4 intentionally has every provider set to `requestEnabled=false`. Phase 5B does not change that state.

Phase 5C.0 keeps every provider at `requestEnabled=false`. A granted DeepSeek optional host permission only means the browser permission is present; it is not a successful provider readiness check and it does not enable real provider requests.

Phase 5C.2 also keeps every provider at `requestEnabled=false`. A successful DeepSeek Real Test means only that the Runtime Key, exact DeepSeek host permission, and DeepSeek API reachability worked for the minimal test request. It does not enable the main AI route.

Phase 6.1 keeps every provider at `requestEnabled=false`. A successful optional background Chat response means only that the explicit single-action beta route worked for that request. It does not enable the main AI route or any other action.

## 9. Logging and Redaction

Logging rules:

- `safeLog` must never print full API keys.
- `safeLog` must never print Authorization header values.
- Provider errors must be normalized before they reach the UI.
- `debugEnabled` must not bypass secret redaction.
- Key previews may use a shape like `sk-...abcd`, but never the full key.

## 10. Future Implementation Phases

Recommended follow-up phases:

```text
Phase 5B: mock Test Connection skeleton
Phase 5C.0: DeepSeek optional host permission status skeleton
Phase 5C.0.1: permission status wire fix + compact Runtime Setup UI
Phase 5C.1: DeepSeek permission request UI
Phase 5C.2: DeepSeek-only real Test Connection
Phase 6: optional background AI route for chat
Phase 6.1: background chat route audit and UI improvement
Phase 6.2: background chat beta release gate
Phase 6.3: background chat beta toggle and local override
Phase 6.4: background chat readiness checklist
Phase 7.0: background runtime actions beta
Phase 7.1: provider adapter hardening
Phase 7: optional background AI route expansion
```

Phase 7.0 should remain experimental and DeepSeek-only. Validate explicit Background Runtime Beta readiness and failure behavior before considering broader provider support.

## 11. Security Checklist

- [ ] manifest does not include `https://*/*`
- [ ] no Native Messaging
- [ ] no arbitrary request proxy
- [ ] no content-visible full API Key
- [ ] no `settings:getPublic` full API Key
- [ ] no Authorization values in logs
- [ ] provider origin from allowlist only
- [ ] no custom endpoint in v0.8.x
- [ ] Test Connection response is minimal and redacted
