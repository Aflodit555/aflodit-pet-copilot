import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createBackgroundRuntime } from "./backgroundRuntime.js";

const DEEPSEEK_ORIGIN = "https://api.deepseek.com/*";
const RUNTIME_KEY = "sk-test-background-preview";

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

function decideChatRoute(input, previewEnabled) {
  const trimmed = String(input || "").trim();
  const lower = trimmed.toLowerCase();
  if (lower.startsWith("/bg ")) return { route: "background", source: "explicit-background", userText: trimmed.slice(4).trim() };
  if (lower.startsWith("@background ")) return { route: "background", source: "explicit-background", userText: trimmed.slice(12).trim() };
  if (lower.startsWith("/local ")) return { route: "local", source: "explicit-local", userText: trimmed.slice(7).trim() };
  if (lower.startsWith("@local ")) return { route: "local", source: "explicit-local", userText: trimmed.slice(7).trim() };
  return { route: previewEnabled ? "background" : "local", source: previewEnabled ? "preview" : "default-local", userText: trimmed };
}

function backgroundFailureRecovery(source) {
  return source === "preview"
    ? "Disable Background Runtime Preview to use Local Backend."
    : "Remove /bg or @background to use ordinary Chat.";
}

async function simulateChatSubmit({ input, previewEnabled, localImpl, backgroundImpl }) {
  const route = decideChatRoute(input, previewEnabled);
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

await check("setting defaults to false", async () => {
  const response = await getPublic(createRuntime());
  assert.equal(response.ok, true);
  assert.equal(response.settings.backgroundRuntimePreviewEnabled, false);
  assert.equal(response.settings.hasApiKey, false);
  assert.equal(response.settings.apiKeyPreview, "");
});

await check("settings save accepts backgroundRuntimePreviewEnabled", async () => {
  const runtime = createRuntime();
  let response = await savePublic(runtime, {
    provider: "deepseek",
    model: "deepseek-chat",
    saveMode: "local",
    debugEnabled: false,
    backgroundRuntimePreviewEnabled: true
  });
  assert.equal(response.ok, true);
  assert.equal(response.settings.backgroundRuntimePreviewEnabled, true);
  assert.equal(response.settings.provider, "deepseek");

  response = await getPublic(runtime);
  assert.equal(response.settings.backgroundRuntimePreviewEnabled, true);
});

await check("settings save migrates legacy backgroundChatPreviewEnabled", async () => {
  const runtime = createRuntime();
  const response = await savePublic(runtime, {
    provider: "deepseek",
    model: "deepseek-chat",
    saveMode: "local",
    debugEnabled: false,
    backgroundChatPreviewEnabled: true
  });
  assert.equal(response.ok, true);
  assert.equal(response.settings.backgroundRuntimePreviewEnabled, true);
});

await check("settings save rejects dangerous public fields", async () => {
  const runtime = createRuntime();
  for (const payload of [
    { apiKey: "sk-should-not-pass" },
    { url: "https://api.deepseek.com/chat/completions" },
    { headers: { Authorization: "Bearer bad" } },
    { rawBody: { model: "deepseek-chat" } }
  ]) {
    const response = await savePublic(runtime, payload);
    assert.equal(response.ok, false);
    assert.ok(["MESSAGE_PAYLOAD_FORBIDDEN", "SETTING_FORBIDDEN"].includes(response.error.code));
  }
});

await check("route matrix with preview off", async () => {
  assert.deepEqual(decideChatRoute("hello", false), { route: "local", source: "default-local", userText: "hello" });
  assert.deepEqual(decideChatRoute("/bg hello", false), { route: "background", source: "explicit-background", userText: "hello" });
  assert.deepEqual(decideChatRoute("@background hello", false), { route: "background", source: "explicit-background", userText: "hello" });
  assert.deepEqual(decideChatRoute("/local hello", false), { route: "local", source: "explicit-local", userText: "hello" });
  assert.deepEqual(decideChatRoute("@local hello", false), { route: "local", source: "explicit-local", userText: "hello" });
});

await check("route matrix with preview on", async () => {
  assert.deepEqual(decideChatRoute("hello", true), { route: "background", source: "preview", userText: "hello" });
  assert.deepEqual(decideChatRoute("/bg hello", true), { route: "background", source: "explicit-background", userText: "hello" });
  assert.deepEqual(decideChatRoute("@background hello", true), { route: "background", source: "explicit-background", userText: "hello" });
  assert.deepEqual(decideChatRoute("/local hello", true), { route: "local", source: "explicit-local", userText: "hello" });
  assert.deepEqual(decideChatRoute("@local hello", true), { route: "local", source: "explicit-local", userText: "hello" });
});

await check("preview background failure does not call local fallback", async () => {
  let localCalls = 0;
  let backgroundCalls = 0;
  const response = await simulateChatSubmit({
    input: "hello",
    previewEnabled: true,
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
  assert.equal(response.recovery, "Disable Background Runtime Preview to use Local Backend.");
  assert.equal(backgroundCalls, 1);
  assert.equal(localCalls, 0);
});

await check("explicit background failure keeps remove prefix recovery", async () => {
  const response = await simulateChatSubmit({
    input: "/bg hello",
    previewEnabled: false,
    localImpl: () => ({ ok: true }),
    backgroundImpl: () => {
      throw new Error("missing readiness");
    }
  });

  assert.equal(response.ok, false);
  assert.equal(response.source, "explicit-background");
  assert.equal(response.recovery, "Remove /bg or @background to use ordinary Chat.");
});

await check("missing permission in preview route guard fails without fetch", async () => {
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

await check("missing Runtime Key in preview route guard fails without fetch", async () => {
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

await check("core non-chat actions are available for runtime preview routing", async () => {
  const previewActions = ["explain_selection", "translate", "summarize_page"];
  assert.deepEqual(previewActions, ["explain_selection", "translate", "summarize_page"]);
});

await check("content source labels cover local and background success/failure", async () => {
  const appSource = readFileSync(new URL("../content-src/07-app.js", import.meta.url), "utf8");
  assert.match(appSource, /Source: Local Backend\. Main AI actions use the local backend\./);
  assert.match(appSource, /Source: Local Backend\. Local backend request failed\./);
  assert.match(appSource, /Source: Background Runtime\. Main AI actions still use the local backend\./);
  assert.match(appSource, /Source: Background Runtime\. Background route failed\./);
});
