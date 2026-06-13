# Chromium Compatibility

## Target Browsers

AFlodit Pet Copilot v0.8.0 is packaged for Chromium extension APIs and Manifest V3.

Supported targets:

- Chrome
- Microsoft Edge
- Brave
- Other Chromium-based browsers on a best-effort basis

This release does not claim Firefox or Safari support.

## Loading The Release Package

1. Build the package:

   ```powershell
   node scripts\buildReleasePackage.js
   node scripts\checkReleasePackage.js
   ```

2. Open the browser extensions page:

   - Chrome: `chrome://extensions`
   - Edge: `edge://extensions`
   - Brave: `brave://extensions`

3. Enable Developer mode.

4. Choose **Load unpacked**.

5. Select:

   ```text
   dist/aflodit-pet-copilot-v0.8.0/
   ```

For development, select `extension/` instead.

## Runtime Setup

Recommended for v0.8.0: Backendless Beta.

Local Backend Dev remains available for development.

For Background Runtime Beta:

- Open Runtime Setup.
- Select DeepSeek, Alibaba Bailian / DashScope, OpenAI, or OpenRouter.
- Save a provider-specific Runtime Key.
- Request the exact optional host permission for the selected provider.
- Run Check Readiness.
- Run Real Test when you are ready to spend a small amount of provider quota.
- Select Background Runtime Beta.

Background Runtime Beta supports DeepSeek, Alibaba Bailian / DashScope, OpenAI, and OpenRouter in this release. DashScope uses the default China Beijing endpoint in this phase. It does not use a wildcard host permission, does not use Native Messaging, and does not support custom endpoints.

## Compatibility Notes

- The extension uses Manifest V3 service workers.
- Optional permission requests are limited to exact provider hosts: `https://api.deepseek.com/*`, `https://dashscope.aliyuncs.com/*`, `https://api.openai.com/*`, and `https://openrouter.ai/*`.
- Background Runtime Beta failures do not silently fall back to Local Backend.
- `/bg` and `@background` force background runtime for Chat.
- `/local` and `@local` force Local Backend for Chat.
