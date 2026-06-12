import assert from "node:assert/strict";
import { createBackgroundRuntime } from "./backgroundRuntime.js";

const MESSAGE_TYPE = "runtime:action";
const DEEPSEEK_ORIGIN = "https://api.deepseek.com/*";
const DEEPSEEK_URL = "https://api.deepseek.com/chat/completions";
const RUNTIME_KEY = "sk-test-background-runtime-actions";

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

async function withRuntime({ permissionGranted = true, fetchImpl } = {}, fn) {
  const previousFetch = globalThis.fetch;
  let fetchCount = 0;
  globalThis.fetch = async (...args) => {
    fetchCount += 1;
    return fetchImpl(...args);
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

async function saveSettings(runtime, overrides = {}) {
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
}

async function saveKey(runtime) {
  const response = await runtime.handleMessage({
    type: "settings:saveSecret",
    payload: { apiKey: RUNTIME_KEY }
  });
  assert.equal(response.ok, true);
}

function send(runtime, payload) {
  return runtime.handleMessage({ type: MESSAGE_TYPE, payload });
}

function assertNoSecretLeak(response) {
  const text = JSON.stringify(response);
  assert.equal(text.includes(RUNTIME_KEY), false);
  assert.equal(text.includes("Bearer"), false);
}

function decideActionRoute({ action, input = "", runtimeMode }) {
  const trimmed = String(input || "").trim();
  const lower = trimmed.toLowerCase();
  if (action === "chat") {
    if (lower.startsWith("/bg ") || lower.startsWith("@background ")) return "background";
    if (lower.startsWith("/local ") || lower.startsWith("@local ")) return "local";
  }
  return runtimeMode === "background_runtime_beta" ? "background" : "local";
}

async function readyRuntime(permissionGranted = true, fetchImpl = async () => ({
  ok: true,
  status: 200,
  json: async () => ({ choices: [{ message: { content: "background action reply" } }] })
})) {
  let runtimeRef;
  let fetchCountRef;
  await withRuntime({ permissionGranted, fetchImpl }, async (runtime, getFetchCount) => {
    runtimeRef = runtime;
    fetchCountRef = getFetchCount;
    await saveSettings(runtime);
    await saveKey(runtime);
  });
  return { runtime: runtimeRef, getFetchCount: fetchCountRef };
}

await check("local backend mode routes explain translate summarize local", async () => {
  assert.equal(decideActionRoute({ action: "explain", runtimeMode: "local_backend" }), "local");
  assert.equal(decideActionRoute({ action: "translate", runtimeMode: "local_backend" }), "local");
  assert.equal(decideActionRoute({ action: "summarize", runtimeMode: "local_backend" }), "local");
});

await check("background runtime beta mode routes explain translate summarize background", async () => {
  assert.equal(decideActionRoute({ action: "explain", runtimeMode: "background_runtime_beta" }), "background");
  assert.equal(decideActionRoute({ action: "translate", runtimeMode: "background_runtime_beta" }), "background");
  assert.equal(decideActionRoute({ action: "summarize", runtimeMode: "background_runtime_beta" }), "background");
});

await check("chat local override and bg prefix route correctly", async () => {
  assert.equal(decideActionRoute({ action: "chat", input: "/local hello", runtimeMode: "background_runtime_beta" }), "local");
  assert.equal(decideActionRoute({ action: "chat", input: "/bg hello", runtimeMode: "local_backend" }), "background");
});

await check("runtime action explain success", async () => {
  await withRuntime({
    fetchImpl: async (url, options) => {
      assert.equal(url, DEEPSEEK_URL);
      const body = JSON.parse(options.body);
      assert.equal(body.messages[0].content.includes("Explain"), true);
      assert.equal(body.messages[1].content, "selected text");
      return {
        ok: true,
        status: 200,
        json: async () => ({ choices: [{ message: { content: "解释结果" } }] })
      };
    }
  }, async (runtime) => {
    await saveSettings(runtime);
    await saveKey(runtime);
    const response = await send(runtime, {
      providerId: "deepseek",
      model: "deepseek-chat",
      action: "explain",
      userText: "",
      selectionText: "selected text"
    });
    assert.equal(response.ok, true);
    assert.equal(response.source, "Background Runtime");
    assert.equal(response.action, "explain");
    assert.equal(response.reply, "解释结果");
    assert.equal(response.requestEnabled, false);
    assertNoSecretLeak(response);
  });
});

await check("runtime action translate and summarize success", async () => {
  await withRuntime({
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content: "ok" } }] })
    })
  }, async (runtime) => {
    await saveSettings(runtime);
    await saveKey(runtime);
    const translate = await send(runtime, {
      providerId: "deepseek",
      action: "translate",
      userText: "",
      selectionText: "hello"
    });
    const summarize = await send(runtime, {
      providerId: "deepseek",
      action: "summarize",
      userText: "",
      pageText: "long page text"
    });
    assert.equal(translate.ok, true);
    assert.equal(translate.action, "translate");
    assert.equal(summarize.ok, true);
    assert.equal(summarize.action, "summarize");
  });
});

await check("runtime action rejects unsafe and invalid payloads", async () => {
  await withRuntime({ fetchImpl: async () => ({ ok: true, status: 200 }) }, async (runtime, getFetchCount) => {
    for (const payload of [
      { providerId: "deepseek", action: "chat", userText: "hello", url: DEEPSEEK_URL },
      { providerId: "deepseek", action: "chat", userText: "hello", headers: { Authorization: "Bearer bad" } },
      { providerId: "deepseek", action: "unknown", userText: "hello" },
      { providerId: "deepseek", action: "chat", userText: "" },
      { providerId: 42, action: "chat", userText: "hello" },
      { providerId: "deepseek", action: "summarize", userText: "hello", pageText: "x".repeat(6001) }
    ]) {
      const response = await send(runtime, payload);
      assert.equal(response.ok, false);
      assert.equal(response.errorCode, "INVALID_PAYLOAD");
      assert.equal(response.requestEnabled, false);
    }
    assert.equal(getFetchCount(), 0);
  });
});

await check("missing permission returns failure without fetch", async () => {
  await withRuntime({
    permissionGranted: false,
    fetchImpl: async () => ({ ok: true, status: 200 })
  }, async (runtime, getFetchCount) => {
    await saveSettings(runtime);
    await saveKey(runtime);
    const response = await send(runtime, {
      providerId: "deepseek",
      action: "chat",
      userText: "hello"
    });
    assert.equal(response.ok, false);
    assert.equal(response.errorCode, "MISSING_PROVIDER_PERMISSION");
    assert.equal(response.source, "Background Runtime");
    assert.equal(response.requestEnabled, false);
    assert.equal(getFetchCount(), 0);
    assertNoSecretLeak(response);
  });
});

await check("missing Runtime Key returns failure without fetch", async () => {
  await withRuntime({
    fetchImpl: async () => ({ ok: true, status: 200 })
  }, async (runtime, getFetchCount) => {
    await saveSettings(runtime);
    const response = await send(runtime, {
      providerId: "deepseek",
      action: "chat",
      userText: "hello"
    });
    assert.equal(response.ok, false);
    assert.equal(response.errorCode, "MISSING_RUNTIME_KEY");
    assert.equal(response.source, "Background Runtime");
    assert.equal(response.requestEnabled, false);
    assert.equal(getFetchCount(), 0);
    assertNoSecretLeak(response);
  });
});

await check("provider error maps to safe failure", async () => {
  await withRuntime({
    fetchImpl: async () => ({ ok: false, status: 503 })
  }, async (runtime) => {
    await saveSettings(runtime);
    await saveKey(runtime);
    const response = await send(runtime, {
      providerId: "deepseek",
      action: "chat",
      userText: "hello"
    });
    assert.equal(response.ok, false);
    assert.equal(response.errorCode, "PROVIDER_UNAVAILABLE");
    assert.equal(response.source, "Background Runtime");
    assertNoSecretLeak(response);
  });
});

await check("runtime action does not change requestEnabled", async () => {
  await withRuntime({
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content: "ok" } }] })
    })
  }, async (runtime) => {
    await saveSettings(runtime);
    await saveKey(runtime);
    const response = await send(runtime, {
      providerId: "deepseek",
      action: "chat",
      userText: "hello"
    });
    const publicSettings = await runtime.handleMessage({ type: "settings:getPublic" });
    assert.equal(response.requestEnabled, false);
    assert.equal(publicSettings.providers.find((provider) => provider.id === "deepseek").requestEnabled, false);
  });
});
