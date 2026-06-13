import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createBackgroundRuntime } from "./backgroundRuntime.js";

const DEEPSEEK_ORIGIN = "https://api.deepseek.com/*";
const DEEPSEEK_URL = "https://api.deepseek.com/chat/completions";
const RUNTIME_KEY = "sk-test-runtime-setup-release-candidate";

async function check(name, fn) {
  try {
    await fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

function createChromeApi(permissionGranted = true) {
  return {
    runtime: {},
    permissions: {
      contains(query, callback) {
        assert.deepEqual(query, { origins: [DEEPSEEK_ORIGIN] });
        callback(permissionGranted);
      }
    }
  };
}

function createRuntime({ permissionGranted = true } = {}) {
  return createBackgroundRuntime({
    chromeApi: createChromeApi(permissionGranted),
    version: "0.8.0"
  });
}

async function saveDeepSeekSettings(runtime) {
  const response = await runtime.handleMessage({
    type: "settings:savePublic",
    payload: {
      provider: "deepseek",
      model: "deepseek-chat",
      saveMode: "local",
      debugEnabled: false,
      runtimeMode: "local_backend"
    }
  });
  assert.equal(response.ok, true);
}

async function saveKey(runtime) {
  const response = await runtime.handleMessage({
    type: "settings:saveSecret",
    payload: { apiKey: RUNTIME_KEY, providerId: "deepseek" }
  });
  assert.equal(response.ok, true);
}

function assertSafe(value) {
  const text = JSON.stringify(value);
  assert.equal(text.includes(RUNTIME_KEY), false);
  assert.equal(text.includes("Authorization"), false);
  assert.equal(text.includes("headers"), false);
  assert.equal(text.includes("rawBody"), false);
  assert.equal(text.includes("choices"), false);
}

function readiness(runtime) {
  return runtime.handleMessage({
    type: "runtime:getBackgroundChatReadiness",
    payload: { providerId: "deepseek", model: "deepseek-chat" }
  });
}

await check("diagnostics does not expose full Runtime Key or Authorization", async () => {
  const runtime = createRuntime({ permissionGranted: true });
  await saveDeepSeekSettings(runtime);
  await saveKey(runtime);
  const response = await runtime.handleMessage({ type: "runtime:getDiagnostics" });
  assert.equal(response.ok, true);
  assertSafe(response);
});

await check("diagnostics includes runtimeMode and hasRuntimeKey boolean", async () => {
  const runtime = createRuntime({ permissionGranted: true });
  await saveDeepSeekSettings(runtime);
  await saveKey(runtime);
  const response = await runtime.handleMessage({ type: "runtime:getDiagnostics" });
  assert.equal(response.diagnostics.runtimeMode, "local_backend");
  assert.equal(response.diagnostics.releaseChannel, "backendless-beta");
  assert.equal(response.diagnostics.hasRuntimeKey, true);
  assert.equal(typeof response.diagnostics.hasRuntimeKey, "boolean");
  assert.equal(response.diagnostics.requestEnabled, false);
});

await check("setup checklist source includes required rows and safe copy diagnostics control", async () => {
  const source = readFileSync(new URL("../content-src/02-dom.js", import.meta.url), "utf8");
  for (const label of [
    "Setup Status",
    "Runtime Mode",
    "Provider",
    "Model",
    "Runtime Key",
    "Host Permission",
    "Readiness",
    "Real Test"
  ]) {
    assert.match(source, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

await check("primary visible setup actions are limited", async () => {
  const source = readFileSync(new URL("../content-src/02-dom.js", import.meta.url), "utf8");
  assert.match(source, />Save Setup</);
  assert.match(source, />Check Readiness</);
  assert.match(source, />Run Real Test</);
  assert.doesNotMatch(source, />Save Settings</);
  assert.doesNotMatch(source, />Save Key</);
});

await check("diagnostics default collapsed and runtime mode switch button is absent", async () => {
  const source = readFileSync(new URL("../content-src/02-dom.js", import.meta.url), "utf8");
  assert.match(source, /id="aflodit-pet-runtime-developer-tools" class="pet-runtime-actions-group hidden"/);
  assert.match(source, /Developer Tools/);
  assert.doesNotMatch(source, /<details class="pet-runtime-actions-group" open>/);
  assert.doesNotMatch(source, /aflodit-pet-runtime-switch-beta/);
  assert.doesNotMatch(source, /Switch to Background Runtime Beta/);
});

await check("user mode hides developer-only setup controls", async () => {
  const source = readFileSync(new URL("../content-src/02-dom.js", import.meta.url), "utf8");
  const appSource = readFileSync(new URL("../content-src/07-app.js", import.meta.url), "utf8");
  assert.match(source, /id="aflodit-pet-runtime-developer-tools" class="pet-runtime-actions-group hidden" data-runtime-developer-only/);
  assert.match(source, /id="aflodit-pet-runtime-test-mock" class="pet-secondary-button">Mock Test/);
  assert.match(source, /id="aflodit-pet-runtime-check-permission" class="pet-secondary-button">Check Permission/);
  assert.match(source, /id="aflodit-pet-runtime-clear-key" class="pet-secondary-button"/);
  assert.match(source, /id="aflodit-pet-runtime-save-mode"/);
  assert.match(source, /id="aflodit-pet-runtime-debug"/);
  assert.match(appSource, /runtimeSetupViewMode === "developer"/);
  assert.match(appSource, /setSetupViewMode\("user"\)/);
});

await check("developer mode exposes advanced test tools", async () => {
  const source = readFileSync(new URL("../content-src/02-dom.js", import.meta.url), "utf8");
  const appSource = readFileSync(new URL("../content-src/07-app.js", import.meta.url), "utf8");
  assert.match(source, /id="aflodit-pet-runtime-copy-diagnostics" class="pet-secondary-button">Copy Diagnostics/);
  assert.match(appSource, /Hide Developer Tools/);
  assert.match(appSource, /Developer Tools/);
  assert.match(appSource, /runtimeDeveloperOnly/);
});

await check("setup screen avoids raw requestEnabled wording in user-facing source", async () => {
  const source = readFileSync(new URL("../content-src/02-dom.js", import.meta.url), "utf8");
  assert.doesNotMatch(source, /requestEnabled/);
});

await check("release docs use Backendless Beta wording instead of Preview wording", async () => {
  const readme = readFileSync(new URL("../../README.md", import.meta.url), "utf8");
  const architecture = readFileSync(new URL("../../docs/ARCHITECTURE.md", import.meta.url), "utf8");
  const permissionRfc = readFileSync(new URL("../../docs/RUNTIME_PROVIDER_PERMISSION_RFC.md", import.meta.url), "utf8");
  assert.match(readme, /Phase 11\.0 Release Mode Cleanup/);
  assert.match(readme, /Recommended for v0\.8\.0: Backendless Beta/);
  assert.match(readme, /Development fallback: Local Backend Dev/);
  assert.doesNotMatch(`${readme}\n${architecture}\n${permissionRfc}`, /Backendless Preview|Runtime Preview|production ready|provider enabled|request enabled yes|provider is connected|provider connection/);
});

await check("Request Permission is hidden by default for unsupported providers", async () => {
  const source = readFileSync(new URL("../content-src/02-dom.js", import.meta.url), "utf8");
  const appSource = readFileSync(new URL("../content-src/07-app.js", import.meta.url), "utf8");
  assert.match(source, /id="aflodit-pet-runtime-request-permission" class="pet-secondary-button hidden"/);
  assert.match(appSource, /not configured for this provider/);
});

await check("Request Permission is available for real providers when permission is missing or unknown", async () => {
  const appSource = readFileSync(new URL("../content-src/07-app.js", import.meta.url), "utf8");
  assert.match(appSource, /providerHasHostPermission\(provider\)/);
  assert.match(appSource, /provider\?\.hasRequiredHostPermission/);
  assert.match(appSource, /const shouldShow = hasPermission && !permissionGranted/);
  assert.match(appSource, /refreshProviderPermissionStatus\(nextProviderId\)/);
});

await check("DashScope setup hint recommends qwen-plus without hardcoded model validation", async () => {
  const source = readFileSync(new URL("./providerRegistry.js", import.meta.url), "utf8");
  assert.match(source, /Use Alibaba Cloud Model Studio \/ Bailian API Key\. Start with qwen-plus\./);
  assert.doesNotMatch(source, /qwen-plus.*includes|allowedModels|modelList/);
});

await check("expected background runtime failures do not log full Error objects by default", async () => {
  const appSource = readFileSync(new URL("../content-src/07-app.js", import.meta.url), "utf8");
  assert.doesNotMatch(appSource, /console\.error\(error\)/);
  assert.match(appSource, /expectedBackgroundRuntimeErrorCodes/);
  assert.match(appSource, /warnExpectedBackgroundRuntimeError\(error\)/);
  assert.match(appSource, /unexpected background runtime failure/);
});

await check("setup checklist reflects missing key through readiness", async () => {
  const runtime = createRuntime({ permissionGranted: true });
  await saveDeepSeekSettings(runtime);
  const response = await readiness(runtime);
  assert.equal(response.ok, true);
  assert.equal(response.checks.find((item) => item.id === "runtimeKey").ok, false);
  assert.equal(response.canUseBackgroundRuntime, false);
});

await check("setup checklist reflects missing permission through readiness", async () => {
  const runtime = createRuntime({ permissionGranted: false });
  await saveDeepSeekSettings(runtime);
  await saveKey(runtime);
  const response = await readiness(runtime);
  assert.equal(response.ok, true);
  assert.equal(response.checks.find((item) => item.id === "permission").ok, false);
  assert.equal(response.canUseBackgroundRuntime, false);
});

await check("setup checklist reflects readiness ready", async () => {
  const runtime = createRuntime({ permissionGranted: true });
  await saveDeepSeekSettings(runtime);
  await saveKey(runtime);
  const response = await readiness(runtime);
  assert.equal(response.ok, true);
  assert.equal(response.canUseBackgroundRuntime, true);
  assert.equal(response.nextAction, "Background Runtime Beta is ready.");
});

await check("lastRealTestStatus stores only safe metadata", async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    assert.equal(url, DEEPSEEK_URL);
    assert.equal(options.headers.Authorization, `Bearer ${RUNTIME_KEY}`);
    return {
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content: "ok" } }] })
    };
  };

  try {
    const runtime = createRuntime({ permissionGranted: true });
    await saveDeepSeekSettings(runtime);
    await saveKey(runtime);
    const response = await runtime.handleMessage({
      type: "runtime:testProviderConnection",
      payload: { providerId: "deepseek", model: "deepseek-chat" }
    });
    assert.equal(response.ok, true);
    assert.deepEqual(Object.keys(response.lastRealTestStatus).sort(), ["checkedAt", "errorCode", "model", "ok", "providerId"].sort());
    assert.equal(response.lastRealTestStatus.ok, true);
    assert.equal(response.lastRealTestStatus.errorCode, "");
    assertSafe(response.lastRealTestStatus);

    const settings = await runtime.handleMessage({ type: "settings:getPublic" });
    assert.equal(settings.settings.lastRealTestStatus.ok, true);
    assertSafe(settings);
  } finally {
    globalThis.fetch = previousFetch;
  }
});
