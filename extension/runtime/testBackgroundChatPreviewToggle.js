import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createBackgroundRuntime } from "./backgroundRuntime.js";

const DEEPSEEK_ORIGIN = "https://api.deepseek.com/*";
const RUNTIME_KEY = "sk-test-background-runtime-mode-compat";

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

function createRuntime(chromeApi = { runtime: {} }) {
  return createBackgroundRuntime({ chromeApi, version: "0.8.0" });
}

async function getPublic(runtime) {
  return runtime.handleMessage({ type: "settings:getPublic" });
}

async function savePublic(runtime, payload) {
  return runtime.handleMessage({ type: "settings:savePublic", payload });
}

function decideChatRoute(input, runtimeMode) {
  const trimmed = String(input || "").trim();
  const lower = trimmed.toLowerCase();
  if (lower.startsWith("/bg ")) return { route: "background", source: "explicit-background", userText: trimmed.slice(4).trim() };
  if (lower.startsWith("@background ")) return { route: "background", source: "explicit-background", userText: trimmed.slice(12).trim() };
  if (lower.startsWith("/local ")) return { route: "local", source: "explicit-local", userText: trimmed.slice(7).trim() };
  if (lower.startsWith("@local ")) return { route: "local", source: "explicit-local", userText: trimmed.slice(7).trim() };
  const backgroundMode = runtimeMode === "background_runtime_beta";
  return { route: backgroundMode ? "background" : "local", source: backgroundMode ? "preview" : "default-local", userText: trimmed };
}

function backgroundFailureRecovery(source) {
  return source === "preview"
    ? "Switch Runtime Mode to Local Backend to use the local backend."
    : "Remove /bg or @background to use ordinary Chat.";
}

async function simulateChatSubmit({ input, runtimeMode, localImpl, backgroundImpl }) {
  const route = decideChatRoute(input, runtimeMode);
  if (route.route === "local") {
    return localImpl(route.userText);
  }

  try {
    return await backgroundImpl(route.userText);
  } catch (error) {
    return {
      ok: false,
      source: route.source,
      recovery: backgroundFailureRecovery(route.source),
      message: "Background Runtime failed."
    };
  }
}

async function withRuntime({ permissionGranted = true, fetchImpl } = {}, fn) {
  const previousFetch = globalThis.fetch;
  let fetchCount = 0;
  globalThis.fetch = async (...args) => {
    fetchCount += 1;
    return fetchImpl(...args);
  };

  try {
    const runtime = createRuntime(createChromeApi(permissionGranted));
    await fn(runtime, () => fetchCount);
  } finally {
    globalThis.fetch = previousFetch;
  }
}

async function saveKey(runtime) {
  const response = await runtime.handleMessage({
    type: "settings:saveSecret",
    payload: { apiKey: RUNTIME_KEY }
  });
  assert.equal(response.ok, true);
}

function sendBackgroundChat(runtime) {
  return runtime.handleMessage({
    type: "runtime:chat",
    payload: {
      providerId: "deepseek",
      model: "deepseek-chat",
      userText: "hello"
    }
  });
}

await check("runtime mode setting defaults to local backend", async () => {
  const response = await getPublic(createRuntime());
  assert.equal(response.ok, true);
  assert.equal(response.settings.runtimeMode, "local_backend");
  assert.equal(response.settings.hasApiKey, false);
  assert.equal(response.settings.apiKeyPreview, "");
});

await check("settings save accepts runtimeMode background beta", async () => {
  const runtime = createRuntime();
  let response = await savePublic(runtime, {
    provider: "deepseek",
    model: "deepseek-chat",
    saveMode: "local",
    debugEnabled: false,
    runtimeMode: "background_runtime_beta"
  });
  assert.equal(response.ok, true);
  assert.equal(response.settings.runtimeMode, "background_runtime_beta");
  assert.equal(response.settings.provider, "deepseek");

  response = await getPublic(runtime);
  assert.equal(response.settings.runtimeMode, "background_runtime_beta");
});

await check("settings save migrates legacy preview flags", async () => {
  const runtime = createRuntime();
  const response = await savePublic(runtime, {
    provider: "deepseek",
    model: "deepseek-chat",
    saveMode: "local",
    debugEnabled: false,
    backgroundChatPreviewEnabled: true
  });
  assert.equal(response.ok, true);
  assert.equal(response.settings.runtimeMode, "background_runtime_beta");
});

await check("runtimeMode wins over legacy preview flag", async () => {
  const runtime = createRuntime();
  const response = await savePublic(runtime, {
    provider: "deepseek",
    model: "deepseek-chat",
    saveMode: "local",
    debugEnabled: false,
    runtimeMode: "local_backend",
    backgroundRuntimePreviewEnabled: true
  });
  assert.equal(response.ok, true);
  assert.equal(response.settings.runtimeMode, "local_backend");
});

await check("settings save rejects dangerous public fields", async () => {
  const runtime = createRuntime();
  for (const payload of [
    { apiKey: "sk-should-not-pass" },
    { url: "https://api.deepseek.com/chat/completions" },
    { headers: { Authorization: "Bearer bad" } },
    { rawBody: { model: "deepseek-chat" } },
    { request: { url: "https://api.deepseek.com" } },
    { config: { endpoint: "https://api.deepseek.com" } }
  ]) {
    const response = await savePublic(runtime, payload);
    assert.equal(response.ok, false);
    assert.ok(["MESSAGE_PAYLOAD_FORBIDDEN", "SETTING_FORBIDDEN"].includes(response.error.code));
  }
});

await check("settings save rejects invalid runtimeMode", async () => {
  const runtime = createRuntime();
  const response = await savePublic(runtime, { runtimeMode: "connected" });
  assert.equal(response.ok, false);
  assert.equal(response.error.code, "RUNTIME_MODE_INVALID");
});

await check("route matrix with local backend mode", async () => {
  assert.deepEqual(decideChatRoute("hello", "local_backend"), { route: "local", source: "default-local", userText: "hello" });
  assert.deepEqual(decideChatRoute("/bg hello", "local_backend"), { route: "background", source: "explicit-background", userText: "hello" });
  assert.deepEqual(decideChatRoute("@background hello", "local_backend"), { route: "background", source: "explicit-background", userText: "hello" });
  assert.deepEqual(decideChatRoute("/local hello", "local_backend"), { route: "local", source: "explicit-local", userText: "hello" });
  assert.deepEqual(decideChatRoute("@local hello", "local_backend"), { route: "local", source: "explicit-local", userText: "hello" });
});

await check("route matrix with background runtime beta mode", async () => {
  assert.deepEqual(decideChatRoute("hello", "background_runtime_beta"), { route: "background", source: "preview", userText: "hello" });
  assert.deepEqual(decideChatRoute("/bg hello", "background_runtime_beta"), { route: "background", source: "explicit-background", userText: "hello" });
  assert.deepEqual(decideChatRoute("@background hello", "background_runtime_beta"), { route: "background", source: "explicit-background", userText: "hello" });
  assert.deepEqual(decideChatRoute("/local hello", "background_runtime_beta"), { route: "local", source: "explicit-local", userText: "hello" });
  assert.deepEqual(decideChatRoute("@local hello", "background_runtime_beta"), { route: "local", source: "explicit-local", userText: "hello" });
});

await check("background beta failure does not call local fallback", async () => {
  let localCalls = 0;
  let backgroundCalls = 0;
  const response = await simulateChatSubmit({
    input: "hello",
    runtimeMode: "background_runtime_beta",
    localImpl: () => {
      localCalls += 1;
      return { ok: true };
    },
    backgroundImpl: () => {
      backgroundCalls += 1;
      throw new Error("missing readiness");
    }
  });

  assert.equal(response.ok, false);
  assert.equal(response.source, "preview");
  assert.equal(response.message, "Background Runtime failed.");
  assert.equal(response.recovery, "Switch Runtime Mode to Local Backend to use the local backend.");
  assert.equal(backgroundCalls, 1);
  assert.equal(localCalls, 0);
});

await check("explicit background failure keeps remove prefix recovery", async () => {
  const response = await simulateChatSubmit({
    input: "/bg hello",
    runtimeMode: "local_backend",
    localImpl: () => ({ ok: true }),
    backgroundImpl: () => {
      throw new Error("missing readiness");
    }
  });

  assert.equal(response.ok, false);
  assert.equal(response.source, "explicit-background");
  assert.equal(response.recovery, "Remove /bg or @background to use ordinary Chat.");
});

await check("missing permission in background route guard fails without fetch", async () => {
  await withRuntime({
    permissionGranted: false,
    fetchImpl: async () => ({ ok: true, status: 200 })
  }, async (runtime, getFetchCount) => {
    await saveKey(runtime);
    const response = await sendBackgroundChat(runtime);
    assert.equal(response.ok, false);
    assert.equal(response.errorCode, "MISSING_PROVIDER_PERMISSION");
    assert.equal(response.requestEnabled, false);
    assert.equal(getFetchCount(), 0);
  });
});

await check("missing Runtime Key in background route guard fails without fetch", async () => {
  await withRuntime({
    fetchImpl: async () => ({ ok: true, status: 200 })
  }, async (runtime, getFetchCount) => {
    const response = await sendBackgroundChat(runtime);
    assert.equal(response.ok, false);
    assert.equal(response.errorCode, "MISSING_RUNTIME_KEY");
    assert.equal(response.requestEnabled, false);
    assert.equal(getFetchCount(), 0);
  });
});

await check("core non-chat actions are available for runtime mode routing", async () => {
  const runtimeActions = ["explain_selection", "translate", "summarize_page"];
  assert.deepEqual(runtimeActions, ["explain_selection", "translate", "summarize_page"]);
});

await check("content source labels cover local and background success/failure", async () => {
  const appSource = readFileSync(new URL("../content-src/07-app.js", import.meta.url), "utf8");
  assert.match(appSource, /Source: Local Backend\. Main AI actions use the local backend\./);
  assert.match(appSource, /Source: Local Backend\. Runtime mode: Local Backend\. Local backend request failed\./);
  assert.match(appSource, /Source: Background Runtime\. Main AI actions still use the local backend\./);
  assert.match(appSource, /Source: Background Runtime\. Background Runtime failed\./);
});
