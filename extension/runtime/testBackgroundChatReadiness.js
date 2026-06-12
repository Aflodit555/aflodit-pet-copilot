import assert from "node:assert/strict";
import { createBackgroundRuntime } from "./backgroundRuntime.js";

const MESSAGE_TYPE = "runtime:getBackgroundChatReadiness";
const DEEPSEEK_ORIGIN = "https://api.deepseek.com/*";
const RUNTIME_KEY = "sk-test-readiness-secret";

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

async function withRuntime({ permissionGranted = true } = {}, fn) {
  const previousFetch = globalThis.fetch;
  let fetchCount = 0;
  globalThis.fetch = async () => {
    fetchCount += 1;
    throw new Error("readiness must not call fetch");
  };

  try {
    const runtime = createBackgroundRuntime({
      chromeApi: createChromeApi(permissionGranted),
      version: "0.8.0"
    });
    await fn(runtime, () => fetchCount);
  } finally {
    globalThis.fetch = previousFetch;
  }
}

function send(runtime, payload) {
  return runtime.handleMessage({ type: MESSAGE_TYPE, payload });
}

async function saveDeepSeekSettings(runtime, overrides = {}) {
  const response = await runtime.handleMessage({
    type: "settings:savePublic",
    payload: {
      provider: "deepseek",
      model: "deepseek-chat",
      saveMode: "local",
      debugEnabled: false,
      runtimeMode: "local_backend",
      ...overrides
    }
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

function assertNoSecretLeak(response) {
  const text = JSON.stringify(response);
  assert.equal(text.includes(RUNTIME_KEY), false);
  assert.equal(text.includes("Bearer"), false);
  assert.equal(text.includes("Authorization"), false);
}

function checkById(response, id) {
  return response.checks.find((item) => item.id === id);
}

await check("readiness succeeds with DeepSeek model key and permission", async () => {
  await withRuntime({ permissionGranted: true }, async (runtime, getFetchCount) => {
    await saveDeepSeekSettings(runtime, { runtimeMode: "background_runtime_beta" });
    await saveKey(runtime);
    const response = await send(runtime, { providerId: "deepseek", model: "deepseek-chat" });

    assert.equal(response.ok, true);
    assert.equal(response.mode, "background-runtime-readiness");
    assert.equal(response.providerId, "deepseek");
    assert.equal(response.providerName, "DeepSeek");
    assert.equal(response.model, "deepseek-chat");
    assert.equal(response.runtimeMode, "background_runtime_beta");
    assert.equal(response.canUseBackgroundRuntime, true);
    assert.equal(response.requestEnabled, false);
    assert.equal(response.nextAction, "Background Runtime Beta is ready.");
    assert.equal(checkById(response, "provider").ok, true);
    assert.equal(checkById(response, "runtimeKey").ok, true);
    assert.equal(checkById(response, "permission").ok, true);
    assert.equal(checkById(response, "model").ok, true);
    assert.equal(checkById(response, "runtimeMode").ok, true);
    assert.equal(checkById(response, "realTest").message, "Real Test: optional / not checked.");
    assert.equal(getFetchCount(), 0);
    assertNoSecretLeak(response);
  });
});

await check("missing Runtime Key returns not ready", async () => {
  await withRuntime({ permissionGranted: true }, async (runtime, getFetchCount) => {
    await saveDeepSeekSettings(runtime);
    const response = await send(runtime, { providerId: "deepseek", model: "deepseek-chat" });

    assert.equal(response.ok, true);
    assert.equal(response.canUseBackgroundRuntime, false);
    assert.equal(checkById(response, "runtimeKey").ok, false);
    assert.equal(response.requestEnabled, false);
    assert.equal(getFetchCount(), 0);
    assertNoSecretLeak(response);
  });
});

await check("missing permission returns not ready", async () => {
  await withRuntime({ permissionGranted: false }, async (runtime, getFetchCount) => {
    await saveDeepSeekSettings(runtime);
    await saveKey(runtime);
    const response = await send(runtime, { providerId: "deepseek", model: "deepseek-chat" });

    assert.equal(response.ok, true);
    assert.equal(response.canUseBackgroundRuntime, false);
    assert.equal(checkById(response, "permission").ok, false);
    assert.equal(response.requestEnabled, false);
    assert.equal(getFetchCount(), 0);
    assertNoSecretLeak(response);
  });
});

await check("OpenAI returns provider not supported", async () => {
  await withRuntime({ permissionGranted: true }, async (runtime, getFetchCount) => {
    await saveKey(runtime);
    const response = await send(runtime, { providerId: "openai", model: "gpt-4o-mini" });

    assert.equal(response.ok, true);
    assert.equal(response.providerId, "openai");
    assert.equal(response.canUseBackgroundRuntime, false);
    assert.equal(checkById(response, "provider").ok, false);
    assert.equal(checkById(response, "permission").ok, false);
    assert.equal(response.requestEnabled, false);
    assert.equal(getFetchCount(), 0);
  });
});

await check("unknown provider rejected", async () => {
  await withRuntime({}, async (runtime, getFetchCount) => {
    const response = await send(runtime, { providerId: "unknown-provider" });

    assert.equal(response.ok, false);
    assert.equal(response.errorCode, "UNKNOWN_PROVIDER");
    assert.equal(response.canUseBackgroundRuntime, false);
    assert.equal(response.requestEnabled, false);
    assert.equal(getFetchCount(), 0);
  });
});

await check("dangerous payload with url rejected", async () => {
  await withRuntime({}, async (runtime, getFetchCount) => {
    const response = await send(runtime, {
      providerId: "deepseek",
      url: "https://api.deepseek.com/chat/completions"
    });

    assert.equal(response.ok, false);
    assert.equal(response.errorCode, "INVALID_PAYLOAD");
    assert.equal(response.requestEnabled, false);
    assert.equal(getFetchCount(), 0);
  });
});

await check("dangerous payload with headers.Authorization rejected", async () => {
  await withRuntime({}, async (runtime, getFetchCount) => {
    const response = await send(runtime, {
      providerId: "deepseek",
      headers: { Authorization: "Bearer SHOULD_NOT_PASS" }
    });

    assert.equal(response.ok, false);
    assert.equal(response.errorCode, "INVALID_PAYLOAD");
    assert.equal(response.requestEnabled, false);
    assert.equal(getFetchCount(), 0);
  });
});

await check("non-string providerId rejected", async () => {
  await withRuntime({}, async (runtime) => {
    const response = await send(runtime, { providerId: 42 });
    assert.equal(response.ok, false);
    assert.equal(response.errorCode, "INVALID_PAYLOAD");
  });
});

await check("empty providerId rejected", async () => {
  await withRuntime({}, async (runtime) => {
    const response = await send(runtime, { providerId: "   " });
    assert.equal(response.ok, false);
    assert.equal(response.errorCode, "INVALID_PAYLOAD");
  });
});

await check("model default fallback works", async () => {
  await withRuntime({ permissionGranted: true }, async (runtime) => {
    await saveDeepSeekSettings(runtime, { model: "   " });
    await saveKey(runtime);
    const response = await send(runtime, { providerId: "deepseek" });

    assert.equal(response.ok, true);
    assert.equal(response.model, "deepseek-chat");
    assert.equal(checkById(response, "model").ok, true);
    assert.equal(response.canUseBackgroundRuntime, true);
  });
});

await check("readiness does not change requestEnabled", async () => {
  await withRuntime({ permissionGranted: true }, async (runtime) => {
    await saveDeepSeekSettings(runtime);
    await saveKey(runtime);
    const response = await send(runtime, { providerId: "deepseek" });
    const publicSettings = await runtime.handleMessage({ type: "settings:getPublic" });

    assert.equal(response.requestEnabled, false);
    assert.equal(publicSettings.providers.find((provider) => provider.id === "deepseek").requestEnabled, false);
  });
});
