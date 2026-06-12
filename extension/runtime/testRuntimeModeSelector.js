import assert from "node:assert/strict";
import { createBackgroundRuntime } from "./backgroundRuntime.js";

const DEEPSEEK_ORIGIN = "https://api.deepseek.com/*";
const RUNTIME_KEY = "sk-test-runtime-mode-selector";

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

function createRuntime(chromeApi = createChromeApi()) {
  return createBackgroundRuntime({ chromeApi, version: "0.8.0" });
}

async function withRuntime({ permissionGranted = true } = {}, fn) {
  const previousFetch = globalThis.fetch;
  let fetchCount = 0;
  globalThis.fetch = async () => {
    fetchCount += 1;
    throw new Error("runtime mode readiness must not call fetch");
  };

  try {
    await fn(createRuntime(createChromeApi(permissionGranted)), () => fetchCount);
  } finally {
    globalThis.fetch = previousFetch;
  }
}

async function getPublic(runtime) {
  return runtime.handleMessage({ type: "settings:getPublic" });
}

async function savePublic(runtime, payload) {
  return runtime.handleMessage({ type: "settings:savePublic", payload });
}

async function saveDeepSeekBeta(runtime, overrides = {}) {
  const response = await savePublic(runtime, {
    provider: "deepseek",
    model: "deepseek-chat",
    saveMode: "local",
    debugEnabled: false,
    runtimeMode: "background_runtime_beta",
    ...overrides
  });
  assert.equal(response.ok, true);
  return response;
}

async function saveKey(runtime) {
  const response = await runtime.handleMessage({
    type: "settings:saveSecret",
    payload: { apiKey: RUNTIME_KEY }
  });
  assert.equal(response.ok, true);
}

function sendReadiness(runtime) {
  return runtime.handleMessage({
    type: "runtime:getBackgroundChatReadiness",
    payload: { providerId: "deepseek", model: "deepseek-chat" }
  });
}

function decideActionRoute({ action, input = "", runtimeMode = "local_backend" }) {
  const trimmed = String(input || "").trim();
  const lower = trimmed.toLowerCase();
  if (action === "chat") {
    if (lower.startsWith("/bg ") || lower.startsWith("@background ")) return "background";
    if (lower.startsWith("/local ") || lower.startsWith("@local ")) return "local";
  }
  return runtimeMode === "background_runtime_beta" ? "background" : "local";
}

function assertNoSecretLeak(value) {
  const text = JSON.stringify(value);
  assert.equal(text.includes(RUNTIME_KEY), false);
  assert.equal(text.includes("Bearer"), false);
  assert.equal(text.includes("Authorization"), false);
}

await check("default runtimeMode is local_backend", async () => {
  const response = await getPublic(createRuntime());
  assert.equal(response.ok, true);
  assert.equal(response.settings.runtimeMode, "local_backend");
  assert.equal(response.settings.hasApiKey, false);
  assert.equal(response.settings.apiKeyPreview, "");
});

await check("settings save accepts valid runtimeMode values", async () => {
  const runtime = createRuntime();
  let response = await savePublic(runtime, { runtimeMode: "background_runtime_beta" });
  assert.equal(response.ok, true);
  assert.equal(response.settings.runtimeMode, "background_runtime_beta");

  response = await savePublic(runtime, { runtimeMode: "local_backend" });
  assert.equal(response.ok, true);
  assert.equal(response.settings.runtimeMode, "local_backend");
});

await check("settings save rejects invalid runtimeMode", async () => {
  const response = await savePublic(createRuntime(), { runtimeMode: "enabled" });
  assert.equal(response.ok, false);
  assert.equal(response.error.code, "RUNTIME_MODE_INVALID");
});

await check("settings save rejects dangerous fields", async () => {
  const runtime = createRuntime();
  for (const payload of [
    { apiKey: "sk-danger" },
    { secret: "secret" },
    { token: "token" },
    { url: "https://api.deepseek.com/chat/completions" },
    { baseUrl: "https://api.deepseek.com" },
    { endpoint: "/chat/completions" },
    { headers: { Authorization: "Bearer danger" } },
    { rawBody: { model: "deepseek-chat" } },
    { request: { provider: "deepseek" } },
    { config: { provider: "deepseek" } }
  ]) {
    const response = await savePublic(runtime, payload);
    assert.equal(response.ok, false);
    assert.ok(["SETTING_FORBIDDEN", "MESSAGE_PAYLOAD_FORBIDDEN"].includes(response.error.code));
  }
});

await check("old backgroundRuntimePreviewEnabled migrates to background_runtime_beta", async () => {
  const response = await savePublic(createRuntime(), { backgroundRuntimePreviewEnabled: true });
  assert.equal(response.ok, true);
  assert.equal(response.settings.runtimeMode, "background_runtime_beta");
});

await check("runtimeMode wins over old preview field", async () => {
  const response = await savePublic(createRuntime(), {
    runtimeMode: "local_backend",
    backgroundRuntimePreviewEnabled: true
  });
  assert.equal(response.ok, true);
  assert.equal(response.settings.runtimeMode, "local_backend");
});

await check("local_backend mode routes normal Chat and three actions to Local Backend", async () => {
  for (const action of ["chat", "explain", "translate", "summarize"]) {
    assert.equal(decideActionRoute({ action, input: "hello", runtimeMode: "local_backend" }), "local");
  }
});

await check("background_runtime_beta routes normal Chat and three actions to Background Runtime", async () => {
  for (const action of ["chat", "explain", "translate", "summarize"]) {
    assert.equal(decideActionRoute({ action, input: "hello", runtimeMode: "background_runtime_beta" }), "background");
  }
});

await check("/bg still forces Background Runtime in local_backend mode", async () => {
  assert.equal(decideActionRoute({ action: "chat", input: "/bg hello", runtimeMode: "local_backend" }), "background");
  assert.equal(decideActionRoute({ action: "chat", input: "@background hello", runtimeMode: "local_backend" }), "background");
});

await check("/local still forces Local Backend in background_runtime_beta mode", async () => {
  assert.equal(decideActionRoute({ action: "chat", input: "/local hello", runtimeMode: "background_runtime_beta" }), "local");
  assert.equal(decideActionRoute({ action: "chat", input: "@local hello", runtimeMode: "background_runtime_beta" }), "local");
});

await check("readiness returns runtimeMode", async () => {
  await withRuntime({ permissionGranted: true }, async (runtime, getFetchCount) => {
    await saveDeepSeekBeta(runtime);
    await saveKey(runtime);
    const response = await sendReadiness(runtime);
    assert.equal(response.ok, true);
    assert.equal(response.runtimeMode, "background_runtime_beta");
    assert.equal(response.canUseBackgroundRuntime, true);
    assert.equal(response.checks.find((checkItem) => checkItem.id === "runtimeMode").ok, true);
    assert.equal(response.nextAction, "Background Runtime Beta is ready.");
    assert.equal(getFetchCount(), 0);
    assertNoSecretLeak(response);
  });
});

await check("readiness does not call fetch", async () => {
  await withRuntime({ permissionGranted: true }, async (runtime, getFetchCount) => {
    await saveDeepSeekBeta(runtime);
    const response = await sendReadiness(runtime);
    assert.equal(response.ok, true);
    assert.equal(response.canUseBackgroundRuntime, false);
    assert.equal(getFetchCount(), 0);
  });
});

await check("readiness does not change requestEnabled", async () => {
  await withRuntime({ permissionGranted: true }, async (runtime) => {
    await saveDeepSeekBeta(runtime);
    await saveKey(runtime);
    const response = await sendReadiness(runtime);
    const publicSettings = await getPublic(runtime);
    assert.equal(response.requestEnabled, false);
    assert.equal(publicSettings.providers.find((provider) => provider.id === "deepseek").requestEnabled, false);
  });
});

await check("no Runtime Key is exposed", async () => {
  await withRuntime({ permissionGranted: true }, async (runtime) => {
    await saveDeepSeekBeta(runtime);
    await saveKey(runtime);
    assertNoSecretLeak(await getPublic(runtime));
    assertNoSecretLeak(await sendReadiness(runtime));
  });
});
