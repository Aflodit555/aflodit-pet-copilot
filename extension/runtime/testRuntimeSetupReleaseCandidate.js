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

const UI_COPY = Object.freeze({
  title: "AI &#35774;&#32622; / &#27169;&#22411;&#19982;&#23494;&#38053;",
  connectionStatus: "&#36830;&#25509;&#29366;&#24577;",
  provider: "&#26381;&#21153;&#21830;",
  modelId: "&#27169;&#22411; ID",
  runtimeKey: "&#36816;&#34892;&#23494;&#38053;",
  lastCheck: "&#26368;&#36817;&#26816;&#26597;",
  advancedTools: "&#39640;&#32423;&#24037;&#20855;",
  back: "&#36820;&#22238;",
  saveConnect: "&#20445;&#23384;&#24182;&#36830;&#25509;",
  reload: "&#37325;&#26032;&#21152;&#36733;"
});

await check("connection status source includes simplified user rows", async () => {
  const source = readFileSync(new URL("../content-src/02-dom.js", import.meta.url), "utf8");
  for (const label of [
    UI_COPY.connectionStatus,
    UI_COPY.provider,
    UI_COPY.modelId,
    UI_COPY.runtimeKey,
    UI_COPY.lastCheck
  ]) {
    assert.ok(source.includes(label), `missing user label: ${label}`);
  }
  assert.doesNotMatch(source, /<b>Host Permission<\/b>/);
  assert.doesNotMatch(source, /<b>Readiness<\/b>/);
  assert.doesNotMatch(source, /<b>Real Test<\/b>/);
});

await check("primary visible setup action is Save and Connect", async () => {
  const source = readFileSync(new URL("../content-src/02-dom.js", import.meta.url), "utf8");
  assert.ok(source.includes(`>${UI_COPY.saveConnect}</button>`));
  assert.doesNotMatch(source, />Save Setup</);
  assert.doesNotMatch(source, />Save &amp; Connect</);
  assert.doesNotMatch(source, />Save Settings</);
  assert.doesNotMatch(source, />Save Key</);
});

await check("AI Settings footer only contains Back Save Connect and Reload", async () => {
  const source = readFileSync(new URL("../content-src/02-dom.js", import.meta.url), "utf8");
  const footerMatch = source.match(/<div class="pet-settings-actions pet-settings-footer pet-runtime-actions">([\s\S]*?)<\/div>\s*<\/div>\s*<div id="aflodit-pet-settings-commands"/);
  assert.ok(footerMatch, "runtime footer block should be found");
  const footer = footerMatch[1];
  assert.match(footer, /aflodit-pet-runtime-back/);
  assert.match(footer, /aflodit-pet-runtime-save/);
  assert.ok(footer.includes(UI_COPY.back));
  assert.ok(footer.includes(UI_COPY.saveConnect));
  assert.match(footer, /aflodit-pet-runtime-reload/);
  assert.ok(footer.includes(UI_COPY.reload));
  assert.doesNotMatch(footer, /aflodit-pet-runtime-check-readiness/);
  assert.doesNotMatch(footer, /aflodit-pet-runtime-test-real/);
  assert.doesNotMatch(footer, /aflodit-pet-runtime-request-permission/);
  assert.doesNotMatch(footer, /aflodit-pet-runtime-dev-toggle/);
});

await check("advanced setup actions are contained in Developer Tools", async () => {
  const source = readFileSync(new URL("../content-src/02-dom.js", import.meta.url), "utf8");
  const devToolsStart = source.indexOf("aflodit-pet-runtime-developer-tools");
  const footerStart = source.indexOf("pet-settings-actions pet-settings-footer pet-runtime-actions");
  assert.ok(devToolsStart > -1, "developer tools block should exist");
  assert.ok(devToolsStart < footerStart, "developer tools should stay outside the footer");
  assert.match(source, /id="aflodit-pet-runtime-request-permission" class="pet-secondary-button hidden">Request Permission/);
  assert.match(source, /id="aflodit-pet-runtime-check-readiness" class="pet-secondary-button">Check Readiness/);
  assert.match(source, /id="aflodit-pet-runtime-test-real" class="pet-secondary-button">Run Real Test/);
  assert.ok(source.includes(`id="aflodit-pet-runtime-dev-toggle" class="pet-link-button pet-runtime-dev-button">${UI_COPY.advancedTools}</button>`));
  assert.doesNotMatch(source, /pet-runtime-status-actions/);
  assert.doesNotMatch(source, /<div class="pet-runtime-actions-title">Setup<\/div>/);
});

await check("Display and Position footer orders Back before Reset Position", async () => {
  const source = readFileSync(new URL("../content-src/02-dom.js", import.meta.url), "utf8");
  const backIndex = source.indexOf("aflodit-pet-display-back");
  const resetIndex = source.indexOf("aflodit-pet-ui-reset-position");
  assert.ok(backIndex > -1, "display back button should exist");
  assert.ok(resetIndex > -1, "reset position button should exist");
  assert.ok(backIndex < resetIndex, "Back should appear before Reset Position");
});

await check("default settings menu presents AI setup and hides legacy local backend", async () => {
  const source = readFileSync(new URL("../content-src/02-dom.js", import.meta.url), "utf8");
  assert.ok(source.includes(UI_COPY.title));
  assert.match(source, /data-settings-view="model" data-runtime-developer-only>Legacy Local Backend/);
  assert.doesNotMatch(source, /data-settings-view="runtime">Runtime Setup/);
  assert.doesNotMatch(source, /data-settings-view="model">Model Config/);
});

await check("DashScope model field uses model ID copy", async () => {
  const source = readFileSync(new URL("../content-src/02-dom.js", import.meta.url), "utf8");
  const appSource = readFileSync(new URL("../content-src/07-app.js", import.meta.url), "utf8");
  assert.ok(source.includes(`>${UI_COPY.modelId}</`));
  assert.match(appSource, /\\u4f7f\\u7528\\u963f\\u91cc\\u4e91\\u767e\\u70bc API Key/);
  assert.match(appSource, /\\u6a21\\u578b ID \\u4f1a\\u539f\\u6837\\u53d1\\u9001\\u7ed9\\u5f53\\u524d\\u670d\\u52a1\\u5546/);
  assert.doesNotMatch(appSource, /Use a DashScope \/ Bailian model ID/);
});

await check("diagnostics default collapsed and runtime mode switch button is absent", async () => {
  const source = readFileSync(new URL("../content-src/02-dom.js", import.meta.url), "utf8");
  const appSource = readFileSync(new URL("../content-src/07-app.js", import.meta.url), "utf8");
  assert.match(source, /id="aflodit-pet-runtime-developer-tools" class="pet-runtime-actions-group hidden"/);
  assert.ok(source.includes(UI_COPY.advancedTools));
  assert.match(appSource, /advancedTools: "\\u9ad8\\u7ea7\\u5de5\\u5177"/);
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
  assert.match(source, /id="aflodit-pet-runtime-local-backend" class="pet-secondary-button">Legacy Local Backend/);
  assert.match(source, /id="aflodit-pet-runtime-save-mode"/);
  assert.match(source, /id="aflodit-pet-runtime-debug"/);
  assert.match(appSource, /runtimeSetupViewMode === "developer"/);
  assert.match(appSource, /setSetupViewMode\("user"\)/);
});

await check("developer mode exposes advanced test tools", async () => {
  const source = readFileSync(new URL("../content-src/02-dom.js", import.meta.url), "utf8");
  const appSource = readFileSync(new URL("../content-src/07-app.js", import.meta.url), "utf8");
  assert.match(source, /id="aflodit-pet-runtime-copy-diagnostics" class="pet-secondary-button">Copy Diagnostics/);
  assert.match(source, /id="aflodit-pet-runtime-request-permission" class="pet-secondary-button hidden">Request Permission/);
  assert.match(source, /id="aflodit-pet-runtime-check-readiness" class="pet-secondary-button">Check Readiness/);
  assert.match(source, /id="aflodit-pet-runtime-test-real" class="pet-secondary-button">Run Real Test/);
  assert.match(appSource, /RUNTIME_COPY\.advancedTools/);
  assert.match(appSource, /runtimeDeveloperOnly/);
});

await check("Save and Connect is one explicit user-triggered flow", async () => {
  const appSource = readFileSync(new URL("../content-src/07-app.js", import.meta.url), "utf8");
  assert.match(appSource, /async saveAndConnect\(\)/);
  assert.match(appSource, /BackgroundRuntimeClient\.savePublicSettings/);
  assert.match(appSource, /BackgroundRuntimeClient\.saveSecret/);
  assert.match(appSource, /BackgroundRuntimeClient\.getProviderPermissionStatus/);
  assert.match(appSource, /BackgroundRuntimeClient\.requestProviderPermission/);
  assert.match(appSource, /BackgroundRuntimeClient\.getBackgroundChatReadiness/);
  assert.match(appSource, /BackgroundRuntimeClient\.testProviderConnection/);
  assert.match(appSource, /RuntimeSettingsManager\.save\(\)/);
});

await check("setup screen avoids raw requestEnabled wording in user-facing source", async () => {
  const source = readFileSync(new URL("../content-src/02-dom.js", import.meta.url), "utf8");
  assert.doesNotMatch(source, /requestEnabled/);
});

await check("release docs describe the current v0.8.0-beta path", async () => {
  const readme = readFileSync(new URL("../../README.md", import.meta.url), "utf8");
  const architecture = readFileSync(new URL("../../docs/ARCHITECTURE.md", import.meta.url), "utf8");
  const permissionRfc = readFileSync(new URL("../../docs/RUNTIME_PROVIDER_PERMISSION_RFC.md", import.meta.url), "utf8");
  assert.match(readme, /Recommended Setup/);
  assert.match(readme, /DashScope/);
  assert.match(readme, /qwen-plus/);
  assert.match(readme, /Local Backend Dev remains available for development and fallback testing/);
  assert.match(architecture, /recommended Background Runtime Beta/);
  assert.match(permissionRfc, /Current Status For v0\.8\.0-beta/);
  assert.doesNotMatch(`${readme}\n${architecture}\n${permissionRfc}`, /Backendless Preview|Runtime Preview|production ready|provider enabled|request enabled yes|provider is connected|provider connection/);
});

await check("Request Permission is hidden by default and only in developer tools", async () => {
  const source = readFileSync(new URL("../content-src/02-dom.js", import.meta.url), "utf8");
  const appSource = readFileSync(new URL("../content-src/07-app.js", import.meta.url), "utf8");
  assert.match(source, /id="aflodit-pet-runtime-request-permission" class="pet-secondary-button hidden"/);
  assert.ok(source.indexOf("aflodit-pet-runtime-request-permission") > source.indexOf("aflodit-pet-runtime-developer-tools"));
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
