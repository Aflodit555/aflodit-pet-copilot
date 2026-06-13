import assert from "node:assert/strict";
import { createBackgroundRuntime } from "./backgroundRuntime.js";

const MESSAGE_TYPE = "runtime:chat";
const DEEPSEEK_ORIGIN = "https://api.deepseek.com/*";
const DEEPSEEK_URL = "https://api.deepseek.com/chat/completions";
const RUNTIME_KEY = "sk-test-background-chat-secret";

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

async function saveKey(runtime) {
  const response = await runtime.handleMessage({
    type: "settings:saveSecret",
    payload: { apiKey: RUNTIME_KEY, providerId: "deepseek" }
  });
  assert.equal(response.ok, true);
}

async function send(runtime, payload) {
  return runtime.handleMessage({ type: MESSAGE_TYPE, payload });
}

function assertNoSecretLeak(response) {
  const text = JSON.stringify(response);
  assert.equal(text.includes(RUNTIME_KEY), false);
  assert.equal(text.includes("Bearer"), false);
}

async function expectInvalid(runtime, getFetchCount, payload, label) {
  const before = getFetchCount();
  const response = await send(runtime, payload);
  assert.equal(response.ok, false, label);
  assert.equal(response.mode, "background-chat", label);
  assert.equal(response.errorCode, "INVALID_PAYLOAD", label);
  assert.equal(response.message, "Invalid background chat payload.", label);
  assert.equal(response.requestEnabled, false, label);
  assert.equal(getFetchCount(), before, `${label} must not call fetch`);
  assertNoSecretLeak(response);
}

await check("success background chat with mocked DeepSeek fetch", async () => {
  let seenUrl = "";
  let seenOptions = null;
  await withRuntime({
    fetchImpl: async (url, options) => {
      seenUrl = url;
      seenOptions = options;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{ message: { content: "background reply" } }]
        })
      };
    }
  }, async (runtime) => {
    await saveKey(runtime);
    const response = await send(runtime, {
      providerId: " deepseek ",
      model: " deepseek-chat ",
      userText: " hello "
    });

    assert.equal(response.ok, true);
    assert.equal(response.mode, "background-chat");
    assert.equal(response.providerId, "deepseek");
    assert.equal(response.model, "deepseek-chat");
    assert.equal(response.reply, "background reply");
    assert.equal(response.requestEnabled, false);
    assert.equal(seenUrl, DEEPSEEK_URL);
    assert.equal(seenOptions.headers.Authorization, `Bearer ${RUNTIME_KEY}`);
    const body = JSON.parse(seenOptions.body);
    assert.equal(body.messages[1].content, "hello");
    assert.equal(body.stream, false);
    assertNoSecretLeak(response);
  });
});

await check("invalid payload with extra url is rejected before fetch", async () => {
  await withRuntime({ fetchImpl: async () => ({ ok: true, status: 200 }) }, async (runtime, getFetchCount) => {
    await saveKey(runtime);
    await expectInvalid(runtime, getFetchCount, {
      providerId: "deepseek",
      model: "deepseek-chat",
      userText: "hello",
      url: DEEPSEEK_URL
    }, "extra url");
  });
});

await check("invalid payload with headers authorization is rejected before fetch", async () => {
  await withRuntime({ fetchImpl: async () => ({ ok: true, status: 200 }) }, async (runtime, getFetchCount) => {
    await saveKey(runtime);
    await expectInvalid(runtime, getFetchCount, {
      providerId: "deepseek",
      model: "deepseek-chat",
      userText: "hello",
      headers: { Authorization: "Bearer SHOULD_NOT_PASS" }
    }, "extra headers");
  });
});

await check("empty userText is rejected", async () => {
  await withRuntime({ fetchImpl: async () => ({ ok: true, status: 200 }) }, async (runtime, getFetchCount) => {
    await saveKey(runtime);
    await expectInvalid(runtime, getFetchCount, {
      providerId: "deepseek",
      model: "deepseek-chat",
      userText: "   "
    }, "empty userText");
  });
});

await check("userText over 512 chars is rejected", async () => {
  await withRuntime({ fetchImpl: async () => ({ ok: true, status: 200 }) }, async (runtime, getFetchCount) => {
    await saveKey(runtime);
    await expectInvalid(runtime, getFetchCount, {
      providerId: "deepseek",
      model: "deepseek-chat",
      userText: "x".repeat(513)
    }, "long userText");
  });
});

await check("non-string providerId is rejected", async () => {
  await withRuntime({ fetchImpl: async () => ({ ok: true, status: 200 }) }, async (runtime, getFetchCount) => {
    await saveKey(runtime);
    await expectInvalid(runtime, getFetchCount, {
      providerId: { id: "deepseek" },
      model: "deepseek-chat",
      userText: "hello"
    }, "non-string providerId");
  });
});

await check("non-string model is rejected", async () => {
  await withRuntime({ fetchImpl: async () => ({ ok: true, status: 200 }) }, async (runtime, getFetchCount) => {
    await saveKey(runtime);
    await expectInvalid(runtime, getFetchCount, {
      providerId: "deepseek",
      model: ["deepseek-chat"],
      userText: "hello"
    }, "non-string model");
  });
});

await check("missing permission returns MISSING_PROVIDER_PERMISSION without fetch", async () => {
  await withRuntime({
    permissionGranted: false,
    fetchImpl: async () => ({ ok: true, status: 200 })
  }, async (runtime, getFetchCount) => {
    await saveKey(runtime);
    const response = await send(runtime, {
      providerId: "deepseek",
      model: "deepseek-chat",
      userText: "hello"
    });
    assert.equal(response.ok, false);
    assert.equal(response.errorCode, "MISSING_PROVIDER_PERMISSION");
    assert.equal(response.requestEnabled, false);
    assert.equal(getFetchCount(), 0);
    assertNoSecretLeak(response);
  });
});

await check("missing Runtime Key returns MISSING_RUNTIME_KEY without fetch", async () => {
  await withRuntime({ fetchImpl: async () => ({ ok: true, status: 200 }) }, async (runtime, getFetchCount) => {
    const response = await send(runtime, {
      providerId: "deepseek",
      model: "deepseek-chat",
      userText: "hello"
    });
    assert.equal(response.ok, false);
    assert.equal(response.errorCode, "MISSING_RUNTIME_KEY");
    assert.equal(response.requestEnabled, false);
    assert.equal(getFetchCount(), 0);
    assertNoSecretLeak(response);
  });
});

await check("auth failure maps to AUTH_FAILED", async () => {
  await withRuntime({
    fetchImpl: async () => ({ ok: false, status: 401 })
  }, async (runtime) => {
    await saveKey(runtime);
    const response = await send(runtime, {
      providerId: "deepseek",
      model: "deepseek-chat",
      userText: "hello"
    });
    assert.equal(response.ok, false);
    assert.equal(response.errorCode, "AUTH_FAILED");
    assertNoSecretLeak(response);
  });
});

await check("timeout maps to TIMEOUT", async () => {
  await withRuntime({
    fetchImpl: async () => {
      const error = new Error("aborted");
      error.name = "AbortError";
      throw error;
    }
  }, async (runtime) => {
    await saveKey(runtime);
    const response = await send(runtime, {
      providerId: "deepseek",
      model: "deepseek-chat",
      userText: "hello"
    });
    assert.equal(response.ok, false);
    assert.equal(response.errorCode, "TIMEOUT");
    assertNoSecretLeak(response);
  });
});

await check("network error maps to NETWORK_ERROR", async () => {
  await withRuntime({
    fetchImpl: async () => {
      throw new TypeError("network failed");
    }
  }, async (runtime) => {
    await saveKey(runtime);
    const response = await send(runtime, {
      providerId: "deepseek",
      model: "deepseek-chat",
      userText: "hello"
    });
    assert.equal(response.ok, false);
    assert.equal(response.errorCode, "NETWORK_ERROR");
    assertNoSecretLeak(response);
  });
});
