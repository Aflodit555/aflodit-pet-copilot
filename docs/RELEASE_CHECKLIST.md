# Release Checklist

## v0.8.0 Backendless Beta

Use this checklist before publishing or sharing a Chromium release package.

Recommended for v0.8.0: Backendless Beta.

Development fallback: Local Backend Dev.

## Package

1. Confirm the working tree only contains intended release changes.
2. Build generated content if content sources changed:

   ```powershell
   node extension\build-content.js
   ```

3. Build the release package:

   ```powershell
   node scripts\buildReleasePackage.js
   ```

4. Check the package:

   ```powershell
   node scripts\checkReleasePackage.js
   ```

The package folder should be:

```text
dist/aflodit-pet-copilot-v0.8.0/
```

## Safety

Run:

```powershell
node extension\runtime\checkReleaseSafety.js
```

Confirm:

- No `https://*/*`.
- No Native Messaging.
- No custom endpoint support.
- No providers beyond DeepSeek, Alibaba Bailian / DashScope, OpenAI, and OpenRouter.
- No host permissions beyond exact listed provider hosts.
- `requestEnabled` remains false.
- Local Backend development mode remains available in source.
- Background Runtime Beta is not default.
- Full Runtime Key is never returned to content script public settings.
- No Authorization header or full API key is logged.
- Background Runtime real requests remain descriptor-driven and limited to listed providers.

## Chromium Manual Test

1. Open `chrome://extensions`, `edge://extensions`, or the equivalent Chromium extensions page.
2. Enable Developer mode.
3. Load unpacked from `dist/aflodit-pet-copilot-v0.8.0/`.
4. Open a normal web page.
5. Confirm the pet UI appears.
6. Confirm Runtime Setup opens in user mode and hides Mock Test / Check Permission.
7. Open Runtime Setup.
8. Select each supported real provider you need, save its provider-specific Runtime Key, request permission, check readiness, and run Real Test.
9. Select Background Runtime Beta.
10. Test Chat, Explain, Translate, and Summarize.
11. Confirm `/local` forces Local Backend Chat.
12. Confirm background failures do not silently fall back.

## Local Backend Dev Path

For development, load unpacked from `extension/`, start the local backend, and keep Runtime Mode as Local Backend Dev.
