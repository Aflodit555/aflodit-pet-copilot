# Release Checklist

## v0.8.1-beta Background Runtime Beta

Use this checklist before publishing or sharing a Chromium release package.

Recommended for v0.8.1-beta: Background Runtime Beta with Alibaba Bailian / DashScope and model ID `qwen-plus`.

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
dist/aflodit-pet-copilot-v0.8.1/
```

## Safety

Run:

```powershell
node extension\runtime\checkReleaseSafety.js
```

Confirm:

- Manifest `https://*/*` appears only in `optional_host_permissions` for Custom Provider.
- Runtime permission requests remain exact-origin only.
- No Native Messaging.
- No arbitrary custom endpoint path, custom headers, or custom request body support.
- No localhost / LAN Custom Provider support.
- Preset provider hosts remain exact listed provider hosts.
- `requestEnabled` remains false.
- Local Backend development mode remains available in source.
- Background Runtime Beta is the default and recommended user path.
- DashScope / `qwen-plus` is the recommended verified provider/model path.
- DeepSeek, OpenAI, and OpenRouter are treated as experimental unless manually verified.
- Full Runtime Key is never returned to content script public settings.
- No Authorization header or full API key is logged.
- Background Runtime real requests remain descriptor-driven for presets and strictly normalized for Custom Provider.
- Normal users use one **Save & Connect** action; separate Request Permission / Check Readiness / Run Real Test controls remain developer-only.

## Chromium Manual Test

1. Open `chrome://extensions`, `edge://extensions`, or the equivalent Chromium extensions page.
2. Enable Developer mode.
3. Load unpacked from `dist/aflodit-pet-copilot-v0.8.1/`.
4. Open a normal web page.
5. Confirm the pet UI appears.
6. Confirm `AI Settings / Model & Key` opens in user mode and hides Mock Test / Check Permission.
7. Select Alibaba Bailian / DashScope.
8. Confirm model ID is `qwen-plus`.
9. Save a DashScope Runtime Key and click **Save & Connect**.
10. Test Chat, Explain, Translate, and Summarize.
11. Select Custom OpenAI-compatible and confirm the Custom Base URL field appears.
12. Confirm `http://`, localhost, query string, and private-network Base URLs are rejected.
13. Confirm `/local` forces Local Backend Chat only when Local Backend Dev is running.
14. Confirm background failures do not silently fall back.

## Local Backend Dev Path

For development, load unpacked from `extension/`, start the local backend, and keep Runtime Mode as Local Backend Dev.
