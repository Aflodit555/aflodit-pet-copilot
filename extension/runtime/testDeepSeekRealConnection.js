import assert from "node:assert/strict";
import { createBackgroundRuntime } from "./backgroundRuntime.js";

const MESSAGE_TYPE = "runtime:testProviderConnection";
const DEEPSEEK_ORIGIN = "https://api.deepseek.com/*";
const DEEPSEEK_URL = "https://api.deepseek.com/chat/completions";
const RUNTIME_KEY = "sk-test-deepseek-secret";

function createChromeApi(permissionGranted) {
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

async function check(name, fn) {
  try {
    await fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

async function createRuntime({ permissionGranted = true, fetchImpl } = {}) {
  const previousFetch = globalThis.fetch;
  if (fetchImpl) globalThis.fetch = fetchImpl;
  const runtime = createBackgroundRuntime({
    chromeApi: createChromeApi(permissionGranted),
    version: "0.8.0"
  });
  return {
    runtime,
    restore() {
      globalThis.fetch = previousFetch;
    }
  };
}

async function send(runtime, payload) {
  return runtime.handleMessage({ type: MESSAGE_TYPE, payload });
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
}

await check("success returns real-test success without enabling requests", async () => {
  let fetchUrl = "";
  let fetchOptions = null;
  const { runtime, restore } = await createRuntime({
    fetchImpl: async (url, options) => {
      fetchUrl = url;
      fetchOptions = options;
      return { ok: true, status: 200 };
    }
  });
  try {
    await saveKey(runtime);
    const response = await send(runtime, { providerId: "deepseek", model: "deepseek-chat" });
    assert.equal(response.ok, true);
    assert.equal(response.mode, "real-test");
    assert.equal(response.providerId, "deepseek");
    assert.equal(response.model, "deepseek-chat");
    assert.equal(response.permissionGranted, true);
    assert.equal(response.hasApiKey, true);
    assert.equal(response.requestEnabled, false);
    assert.equal(fetchUrl, DEEPSEEK_URL);
    assert.equal(fetchOptions.headers.Authorization, `Bearer ${RUNTIME_KEY}`);
    assertNoSecretLeak(response);
  } finally {
    restore();
  }
});

await check("missing permission returns MISSING_PROVIDER_PERMISSION", async () => {
  let fetchCalled = false;
  const { runtime, restore } = await createRuntime({
    permissionGranted: false,
    fetchImpl: async () => {
      fetchCalled = true;
      return { ok: true, status: 200 };
    }
  });
  try {
    await saveKey(runtime);
    const response = await send(runtime, { providerId: "deepseek", model: "deepseek-chat" });
    assert.equal(response.ok, false);
    assert.equal(response.errorCode, "MISSING_PROVIDER_PERMISSION");
    assert.equal(response.requestEnabled, false);
    assert.equal(fetchCalled, false);
    assertNoSecretLeak(response);
  } finally {
    restore();
  }
});

await check("missing Runtime Key returns MISSING_RUNTIME_KEY", async () => {
  let fetchCalled = false;
  const { runtime, restore } = await createRuntime({
    fetchImpl: async () => {
      fetchCalled = true;
      return { ok: true, status: 200 };
    }
  });
  try {
    const response = await send(runtime, { providerId: "deepseek", model: "deepseek-chat" });
    assert.equal(response.ok, false);
    assert.equal(response.errorCode, "MISSING_RUNTIME_KEY");
    assert.equal(response.requestEnabled, false);
    assert.equal(fetchCalled, false);
    assertNoSecretLeak(response);
  } finally {
    restore();
  }
});

await check("invalid payload with url is rejected", async () => {
  const { runtime, restore } = await createRuntime();
  try {
    const response = await send(runtime, {
      providerId: "deepseek",
      url: DEEPSEEK_URL
    });
    assert.equal(response.ok, false);
    assert.equal(response.mode, "real-test");
    assert.equal(response.errorCode, "INVALID_PAYLOAD");
    assert.equal(response.message, "Invalid provider test payload.");
    assertNoSecretLeak(response);
  } finally {
    restore();
  }
});

await check("invalid payload with headers.Authorization is rejected", async () => {
  const { runtime, restore } = await createRuntime();
  try {
    const response = await send(runtime, {
      providerId: "deepseek",
      headers: {
        Authorization: "Bearer SHOULD_NOT_PASS"
      }
    });
    assert.equal(response.ok, false);
    assert.equal(response.errorCode, "INVALID_PAYLOAD");
    assertNoSecretLeak(response);
  } finally {
    restore();
  }
});

await check("OpenAI returns REAL_TEST_NOT_CONFIGURED without fetch", async () => {
  let fetchCalled = false;
  const { runtime, restore } = await createRuntime({
    fetchImpl: async () => {
      fetchCalled = true;
      return { ok: true, status: 200 };
    }
  });
  try {
    const response = await send(runtime, { providerId: "openai", model: "gpt-4o-mini" });
    assert.equal(response.ok, false);
    assert.equal(response.errorCode, "REAL_TEST_NOT_CONFIGURED");
    assert.equal(response.requestEnabled, false);
    assert.equal(fetchCalled, false);
  } finally {
    restore();
  }
});

await check("unknown provider returns UNKNOWN_PROVIDER", async () => {
  let fetchCalled = false;
  const { runtime, restore } = await createRuntime({
    fetchImpl: async () => {
      fetchCalled = true;
      return { ok: true, status: 200 };
    }
  });
  try {
    const response = await send(runtime, { providerId: "unknown-provider", model: "x" });
    assert.equal(response.ok, false);
    assert.equal(response.errorCode, "UNKNOWN_PROVIDER");
    assert.equal(response.requestEnabled, false);
    assert.equal(fetchCalled, false);
  } finally {
    restore();
  }
});

await check("HTTP 401 maps to AUTH_FAILED", async () => {
  const { runtime, restore } = await createRuntime({
    fetchImpl: async () => ({ ok: false, status: 401 })
  });
  try {
    await saveKey(runtime);
    const response = await send(runtime, { providerId: "deepseek", model: "deepseek-chat" });
    assert.equal(response.ok, false);
    assert.equal(response.errorCode, "AUTH_FAILED");
    assert.equal(response.message, "DeepSeek authentication failed. Check your Runtime Key.");
    assertNoSecretLeak(response);
  } finally {
    restore();
  }
});

await check("HTTP 429 maps to RATE_LIMITED", async () => {
  const { runtime, restore } = await createRuntime({
    fetchImpl: async () => ({ ok: false, status: 429 })
  });
  try {
    await saveKey(runtime);
    const response = await send(runtime, { providerId: "deepseek", model: "deepseek-chat" });
    assert.equal(response.ok, false);
    assert.equal(response.errorCode, "RATE_LIMITED");
    assertNoSecretLeak(response);
  } finally {
    restore();
  }
});

await check("timeout maps to TIMEOUT", async () => {
  const { runtime, restore } = await createRuntime({
    fetchImpl: async () => {
      const error = new Error("aborted");
      error.name = "AbortError";
      throw error;
    }
  });
  try {
    await saveKey(runtime);
    const response = await send(runtime, { providerId: "deepseek", model: "deepseek-chat" });
    assert.equal(response.ok, false);
    assert.equal(response.errorCode, "TIMEOUT");
    assertNoSecretLeak(response);
  } finally {
    restore();
  }
});

await check("fetch URL and body are fixed minimal DeepSeek request", async () => {
  let fetchUrl = "";
  let requestBody = null;
  const { runtime, restore } = await createRuntime({
    fetchImpl: async (url, options) => {
      fetchUrl = url;
      requestBody = JSON.parse(options.body);
      return { ok: true, status: 200 };
    }
  });
  try {
    await saveKey(runtime);
    const response = await send(runtime, { providerId: "deepseek", model: "" });
    assert.equal(response.ok, true);
    assert.equal(response.model, "deepseek-chat");
    assert.equal(fetchUrl, DEEPSEEK_URL);
    assert.deepEqual(requestBody.messages, [{ role: "user", content: "ping" }]);
    assert.equal(requestBody.max_tokens, 1);
    assert.equal(requestBody.temperature, 0);
    assert.equal(requestBody.stream, false);
  } finally {
    restore();
  }
});

await check("fetch uses Runtime Key internally but output does not expose it", async () => {
  let authorizationHeader = "";
  const { runtime, restore } = await createRuntime({
    fetchImpl: async (url, options) => {
      authorizationHeader = options.headers.Authorization;
      return { ok: true, status: 200 };
    }
  });
  try {
    await saveKey(runtime);
    const response = await send(runtime, { providerId: "deepseek", model: "deepseek-reasoner" });
    assert.equal(response.ok, true);
    assert.equal(response.model, "deepseek-reasoner");
    assert.equal(authorizationHeader, `Bearer ${RUNTIME_KEY}`);
    assertNoSecretLeak(response);
  } finally {
    restore();
  }
});
