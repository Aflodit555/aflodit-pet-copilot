# Runtime Provider Permission RFC

## 1. Goal

Phase 5A defines the permission strategy for future real provider requests from the extension background runtime.

The goals are:

- Define a safe permission boundary before enabling provider adapters.
- Define the security model for a future Test Connection feature.
- Keep Phase 5A as documentation only; it does not implement runtime requests.

Phase 5A does not change the current AI request path. Chat, explain, translate, and summarize continue to use the local backend.

## 2. Non-goals

Phase 5A does not:

- Switch the AI request path from the local backend to the background runtime.
- Add real provider network calls.
- Add host permissions.
- Add optional host permissions.
- Support custom endpoints.
- Expose the full Runtime Key or backend API Key to the content script.
- Turn the background runtime into a generic proxy.

## 3. Current Architecture

The stable AI path is still:

```text
content script -> local backend -> provider
```

The Backendless Preview path is currently:

```text
content script -> background runtime settings/secret preview
```

The preview path stores and reloads public settings, provider allowlist state, and a Runtime Key preview. It does not run real AI requests yet.

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

Test Connection is a future design item, not implemented in Phase 5A.

Rules:

- Test Connection runs only in the trusted background runtime.
- The content script may send only public fields such as `providerId` and `model`.
- The Runtime Key is read only inside the background runtime.
- The request URL is built only from the provider allowlist descriptor.
- Headers are generated only inside the provider adapter.
- The content script must not provide URL, headers, or raw request body fields.
- The response must be minimal and redacted.

Successful response shape:

```json
{
  "ok": true,
  "providerId": "deepseek",
  "requestEnabled": true,
  "latencyMs": 1234
}
```

Failure response shape:

```json
{
  "ok": false,
  "errorCode": "AUTH_FAILED",
  "message": "Authentication failed. Check your runtime key.",
  "requestEnabled": false
}
```

Responses must not include:

- Authorization header values.
- Full API keys.
- Full request bodies.
- Raw provider responses.
- Stack traces that contain secret material.

## 7. Token and Cost Policy

Test Connection may consume provider quota after real provider requests are enabled.

Recommended rollout:

- Phase 5B: implement mock Test Connection skeleton only.
- Phase 5C: implement real Test Connection with the smallest practical request.
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

Phase 4 intentionally has every provider set to `requestEnabled=false`. Phase 5A does not change that state.

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
Phase 5C: permission request UI + one provider real Test Connection
Phase 5D: provider adapter hardening
Phase 6: optional background AI route for one action
```

Phase 6 should not migrate all AI actions at once. Validate one background route first, for example chat, before considering explain, translate, or summarize.

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
