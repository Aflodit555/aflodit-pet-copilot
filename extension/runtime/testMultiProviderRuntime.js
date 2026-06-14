import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createBackgroundRuntime } from "./backgroundRuntime.js";
import { buildOpenAiCompatibleUrlForTest } from "./openAiCompatibleRequest.js";
import { getProvider, isRealRuntimeProvider, listProviders } from "./providerRegistry.js";

const PROVIDERS = {
  deepseek: {
    permission: "https://api.deepseek.com/*",
    url: "https://api.deepseek.com/chat/completions",
    model: "deepseek-chat",
    key: "sk-test-deepseek-provider-key"
  },
  dashscope: {
    permission: "https://dashscope.aliyuncs.com/*",
    url: "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
    model: "qwen-plus",
    key: "sk-test-dashscope-provider-key"
  },
  openai: {
    permission: "https://api.openai.com/*",
    url: "https://api.openai.com/v1/chat/completions",
    model: "gpt-4o-mini",
    key: "sk-test-openai-provider-key"
  },
  openrouter: {
    permission: "https://openrouter.ai/*",
    url: "https://openrouter.ai/api/v1/chat/completions",
    model: "openai/gpt-4o-mini",
    key: "sk-test-openrouter-provider-key"
  }
};

async function check(name, fn) {
  try {
    await fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

function createChromeApi({ permissionGranted = true, onContains = () => {}, onRequest = () => {} } = {}) {
  return {
    runtime: {},
    permissions: {
      contains(query, callback) {
        onContains(query);
        callback(permissionGranted);
      },
      request(query, callback) {
        onRequest(query);
        callback(permissionGranted);
      }
    }
  };
}

function createRuntime(options = {}) {
  return createBackgroundRuntime({
    chromeApi: createChromeApi(options),
    version: "0.8.0"
  });
}

function assertNoSecretLeak(value) {
  const text = JSON.stringify(value);
  for (const { key } of Object.values(PROVIDERS)) {
    assert.equal(text.includes(key), false);
  }
  assert.equal(text.includes("Bearer"), false);
  assert.equal(text.includes("headers"), false);
  assert.equal(text.includes("rawBody"), false);
  assert.equal(text.includes("choices"), false);
}

async function saveProviderKey(runtime, providerId) {
  const response = await runtime.handleMessage({
    type: "settings:saveSecret",
    payload: { apiKey: PROVIDERS[providerId].key, providerId }
  });
  assert.equal(response.ok, true);
  assertNoSecretLeak(response);
}

await check("provider descriptors have exact requiredHostPermission", async () => {
  for (const [providerId, expected] of Object.entries(PROVIDERS)) {
    const provider = getProvider(providerId);
    assert(provider, `${providerId} descriptor must exist`);
    assert.equal(provider.requiredHostPermission, expected.permission);
    assert.equal(isRealRuntimeProvider(provider), true);
    assert.equal(buildOpenAiCompatibleUrlForTest(provider), expected.url);
    assert.equal(provider.requestEnabled, false);
    assert.equal(provider.customEndpoint, false);
    assert.doesNotMatch(provider.requiredHostPermission, new RegExp(`^https://${"\\*"}/\\*$`));
  }
  assert.equal(isRealRuntimeProvider(getProvider("mock")), false);
});

await check("no descriptor uses wildcard host", async () => {
  for (const provider of listProviders()) {
    assert.notEqual(provider.requiredHostPermission, `https://${"*"}/*`);
  }
});

await check("manifest optional_host_permissions contains exact provider hosts only", async () => {
  const manifest = JSON.parse(readFileSync(new URL("../manifest.json", import.meta.url), "utf8"));
  assert.deepEqual(manifest.optional_host_permissions.sort(), Object.values(PROVIDERS).map((item) => item.permission).sort());
});

await check("permission status works for all real providers", async () => {
  for (const [providerId, expected] of Object.entries(PROVIDERS)) {
    let seen = null;
    const runtime = createRuntime({
      permissionGranted: true,
      onContains(query) {
        seen = query;
      }
    });
    const response = await runtime.handleMessage({
      type: "runtime:getProviderPermissionStatus",
      payload: { providerId }
    });
    assert.deepEqual(seen, { origins: [expected.permission] });
    assert.equal(response.ok, true);
    assert.equal(response.permissionGranted, true);
    assert.equal(response.requestEnabled, false);
  }
});

await check("permission request uses selected provider exact host", async () => {
  for (const [providerId, expected] of Object.entries(PROVIDERS)) {
    let seen = null;
    const runtime = createRuntime({
      permissionGranted: true,
      onRequest(query) {
        seen = query;
      }
    });
    const response = await runtime.handleMessage({
      type: "runtime:requestProviderPermission",
      payload: { providerId }
    });
    assert.deepEqual(seen, { origins: [expected.permission] });
    assert.equal(response.ok, true);
    assert.equal(response.requestEnabled, false);
  }
});

await check("Real Test supports all providers with mocked fetch", async () => {
  const previousFetch = globalThis.fetch;
  try {
    for (const [providerId, expected] of Object.entries(PROVIDERS)) {
      let fetchUrl = "";
      let requestBody = null;
      globalThis.fetch = async (url, options) => {
        fetchUrl = url;
        requestBody = JSON.parse(options.body);
        assert.equal(options.headers.Authorization, `Bearer ${expected.key}`);
        return { ok: true, status: 200 };
      };
      const runtime = createRuntime({ permissionGranted: true });
      await saveProviderKey(runtime, providerId);
      const response = await runtime.handleMessage({
        type: "runtime:testProviderConnection",
        payload: { providerId, model: expected.model }
      });
      assert.equal(response.ok, true);
      assert.equal(response.providerId, providerId);
      assert.equal(response.model, expected.model);
      assert.equal(response.requestEnabled, false);
      assert.equal(fetchUrl, expected.url);
      assert.deepEqual(requestBody.messages, [{ role: "user", content: "ping" }]);
      assert.equal(requestBody.max_tokens, 1);
      assert.equal(requestBody.temperature, 0);
      assert.equal(requestBody.stream, false);
      assertNoSecretLeak(response);
    }
  } finally {
    globalThis.fetch = previousFetch;
  }
});

await check("DashScope user-entered model ID is sent unchanged and provider errors reach diagnostics safely", async () => {
  const previousFetch = globalThis.fetch;
  const selectedModel = "qwen3.7-plus";
  let requestBody = null;
  try {
    globalThis.fetch = async (url, options) => {
      assert.equal(url, PROVIDERS.dashscope.url);
      requestBody = JSON.parse(options.body);
      assert.equal(options.headers.Authorization, `Bearer ${PROVIDERS.dashscope.key}`);
      return {
        ok: false,
        status: 400,
        text: async () => JSON.stringify({
          error: {
            code: "InvalidParameter",
            message: `model ${selectedModel} rejected, key ${PROVIDERS.dashscope.key}`
          }
        })
      };
    };

    const runtime = createRuntime({ permissionGranted: true });
    await runtime.handleMessage({
      type: "settings:savePublic",
      payload: { provider: "dashscope", model: selectedModel }
    });
    await saveProviderKey(runtime, "dashscope");

    const response = await runtime.handleMessage({
      type: "runtime:testProviderConnection",
      payload: { providerId: "dashscope", model: selectedModel }
    });
    assert.equal(requestBody.model, selectedModel);
    assert.equal(response.ok, false);
    assert.equal(response.errorCode, "PROVIDER_BAD_REQUEST");
    assert.equal(response.lastRealTestStatus.model, selectedModel);
    assert.equal(response.lastRealTestStatus.providerError.endpointHost, "dashscope.aliyuncs.com");
    assert.equal(response.lastRealTestStatus.providerError.httpStatus, 400);
    assert.equal(response.lastRealTestStatus.providerError.providerErrorCode, "InvalidParameter");
    assert.equal(response.lastRealTestStatus.providerError.rawErrorBody.includes(PROVIDERS.dashscope.key), false);

    const diagnostics = await runtime.handleMessage({ type: "runtime:getDiagnostics" });
    assert.equal(diagnostics.diagnostics.lastRealTestStatus.providerError.httpStatus, 400);
    assert.equal(diagnostics.diagnostics.lastRealTestStatus.providerError.rawErrorBody.includes(PROVIDERS.dashscope.key), false);
    assertNoSecretLeak(response);
    assertNoSecretLeak(diagnostics);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

await check("DashScope qwen3 action disables thinking at request top level only for qwen3 series", async () => {
  const previousFetch = globalThis.fetch;
  try {
    const bodies = [];
    globalThis.fetch = async (url, options) => {
      assert.equal(url, PROVIDERS.dashscope.url);
      bodies.push(JSON.parse(options.body));
      return {
        ok: true,
        status: 200,
        json: async () => ({ choices: [{ message: { content: "ok" } }] })
      };
    };

    const runtime = createRuntime({ permissionGranted: true });
    await saveProviderKey(runtime, "dashscope");
    await runtime.handleMessage({
      type: "runtime:action",
      payload: {
        providerId: "dashscope",
        model: "qwen3.6-plus",
        action: "translate",
        userText: "",
        selectionText: "hello"
      }
    });
    await runtime.handleMessage({
      type: "runtime:action",
      payload: {
        providerId: "dashscope",
        model: "qwen-plus",
        action: "translate",
        userText: "",
        selectionText: "hello"
      }
    });

    assert.equal(bodies[0].model, "qwen3.6-plus");
    assert.equal(bodies[0].enable_thinking, false);
    assert.equal(Object.hasOwn(bodies[1], "enable_thinking"), false);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

await check("action timeout records action diagnostics separately from real test status", async () => {
  const previousFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => {
      const error = new Error("aborted");
      error.name = "AbortError";
      throw error;
    };

    const runtime = createRuntime({ permissionGranted: true });
    await saveProviderKey(runtime, "dashscope");
    const response = await runtime.handleMessage({
      type: "runtime:action",
      payload: {
        providerId: "dashscope",
        model: "qwen3.6-plus",
        action: "translate",
        userText: "",
        selectionText: "hello"
      }
    });
    assert.equal(response.ok, false);
    assert.equal(response.errorCode, "TIMEOUT");
    assert.equal(response.lastActionFailure.action, "translate");
    assert.equal(response.lastActionFailure.timeoutMs, 45000);
    assert.equal(response.lastActionFailure.errorType, "timeout");

    const diagnostics = await runtime.handleMessage({ type: "runtime:getDiagnostics" });
    assert.equal(diagnostics.diagnostics.lastActionFailure.action, "translate");
    assert.equal(diagnostics.diagnostics.lastActionFailure.timeoutMs, 45000);
    assert.equal(diagnostics.diagnostics.lastActionFailure.errorType, "timeout");
    assert.equal(diagnostics.diagnostics.lastRealTestStatus, null);
    assertNoSecretLeak(response);
    assertNoSecretLeak(diagnostics);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

await check("runtime action supports all providers with mocked fetch", async () => {
  const previousFetch = globalThis.fetch;
  try {
    for (const [providerId, expected] of Object.entries(PROVIDERS)) {
      let fetchUrl = "";
      let requestBody = null;
      globalThis.fetch = async (url, options) => {
        fetchUrl = url;
        requestBody = JSON.parse(options.body);
        assert.equal(options.headers.Authorization, `Bearer ${expected.key}`);
        return {
          ok: true,
          status: 200,
          json: async () => ({ choices: [{ message: { content: `${providerId} reply` } }] })
        };
      };
      const runtime = createRuntime({ permissionGranted: true });
      await saveProviderKey(runtime, providerId);
      const response = await runtime.handleMessage({
        type: "runtime:action",
        payload: {
          providerId,
          model: expected.model,
          action: "chat",
          userText: "hello"
        }
      });
      assert.equal(response.ok, true);
      assert.equal(response.providerId, providerId);
      assert.equal(response.reply, `${providerId} reply`);
      assert.equal(response.requestEnabled, false);
      assert.equal(fetchUrl, expected.url);
      assert.equal(requestBody.model, expected.model);
      assert.equal(requestBody.stream, false);
      assertNoSecretLeak(response);
    }
  } finally {
    globalThis.fetch = previousFetch;
  }
});

await check("unknown provider rejected and mock cannot perform real request", async () => {
  const runtime = createRuntime({ permissionGranted: true });
  const unknown = await runtime.handleMessage({
    type: "runtime:testProviderConnection",
    payload: { providerId: "unknown-provider", model: "x" }
  });
  assert.equal(unknown.ok, false);
  assert.equal(unknown.errorCode, "UNKNOWN_PROVIDER");

  const mock = await runtime.handleMessage({
    type: "runtime:testProviderConnection",
    payload: { providerId: "mock", model: "mock-model" }
  });
  assert.equal(mock.ok, false);
  assert.equal(mock.errorCode, "REAL_TEST_NOT_CONFIGURED");
  assert.equal(mock.requestEnabled, false);
});

await check("dangerous payloads are rejected", async () => {
  const runtime = createRuntime({ permissionGranted: true });
  const withUrl = await runtime.handleMessage({
    type: "runtime:testProviderConnection",
    payload: { providerId: "deepseek", url: "https://api.deepseek.com/chat/completions" }
  });
  assert.equal(withUrl.ok, false);
  assert.equal(withUrl.errorCode, "INVALID_PAYLOAD");

  const withAuthHeader = await runtime.handleMessage({
    type: "runtime:action",
    payload: {
      providerId: "deepseek",
      action: "chat",
      userText: "hello",
      headers: { Authorization: "Bearer SHOULD_NOT_PASS" }
    }
  });
  assert.equal(withAuthHeader.ok, false);
  assert.equal(withAuthHeader.errorCode, "INVALID_PAYLOAD");
});

await check("provider-specific key preview does not expose full key", async () => {
  const runtime = createRuntime({ permissionGranted: true });
  await runtime.handleMessage({
    type: "settings:savePublic",
    payload: { provider: "dashscope", model: "qwen-plus" }
  });
  await saveProviderKey(runtime, "dashscope");
  const response = await runtime.handleMessage({ type: "settings:getPublic" });
  assert.equal(response.ok, true);
  assert.equal(response.settings.provider, "dashscope");
  assert.equal(response.settings.hasApiKey, true);
  assert.notEqual(response.settings.apiKeyPreview, "");
  assertNoSecretLeak(response);
  const dashscope = response.providers.find((provider) => provider.id === "dashscope");
  const openai = response.providers.find((provider) => provider.id === "openai");
  assert.equal(dashscope.hasApiKey, true);
  assert.equal(openai.hasApiKey, false);
});

await check("readiness missing key and missing permission fail per provider without fetch", async () => {
  const previousFetch = globalThis.fetch;
  let fetchCalled = false;
  globalThis.fetch = async () => {
    fetchCalled = true;
    return { ok: true, status: 200 };
  };
  try {
    for (const providerId of Object.keys(PROVIDERS)) {
      const missingKeyRuntime = createRuntime({ permissionGranted: true });
      const missingKey = await missingKeyRuntime.handleMessage({
        type: "runtime:getBackgroundChatReadiness",
        payload: { providerId, model: PROVIDERS[providerId].model }
      });
      assert.equal(missingKey.ok, true);
      assert.equal(missingKey.canUseBackgroundRuntime, false);
      assert.equal(missingKey.checks.find((item) => item.id === "runtimeKey").ok, false);

      const missingPermissionRuntime = createRuntime({ permissionGranted: false });
      await saveProviderKey(missingPermissionRuntime, providerId);
      const missingPermission = await missingPermissionRuntime.handleMessage({
        type: "runtime:getBackgroundChatReadiness",
        payload: { providerId, model: PROVIDERS[providerId].model }
      });
      assert.equal(missingPermission.ok, true);
      assert.equal(missingPermission.canUseBackgroundRuntime, false);
      assert.equal(missingPermission.checks.find((item) => item.id === "permission").ok, false);
    }
    assert.equal(fetchCalled, false);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

await check("dashscope readiness is blocked without permission and ready after permission grant", async () => {
  const previousFetch = globalThis.fetch;
  let fetchCalled = false;
  globalThis.fetch = async () => {
    fetchCalled = true;
    return { ok: true, status: 200 };
  };
  try {
    const blockedRuntime = createRuntime({ permissionGranted: false });
    await saveProviderKey(blockedRuntime, "dashscope");
    const blocked = await blockedRuntime.handleMessage({
      type: "runtime:getBackgroundChatReadiness",
      payload: { providerId: "dashscope", model: "qwen-plus" }
    });
    assert.equal(blocked.ok, true);
    assert.equal(blocked.providerId, "dashscope");
    assert.equal(blocked.canUseBackgroundRuntime, false);
    assert.equal(blocked.checks.find((item) => item.id === "runtimeKey").ok, true);
    assert.equal(blocked.checks.find((item) => item.id === "permission").ok, false);

    const readyRuntime = createRuntime({ permissionGranted: true });
    await saveProviderKey(readyRuntime, "dashscope");
    const ready = await readyRuntime.handleMessage({
      type: "runtime:getBackgroundChatReadiness",
      payload: { providerId: "dashscope", model: "qwen-plus" }
    });
    assert.equal(ready.ok, true);
    assert.equal(ready.providerId, "dashscope");
    assert.equal(ready.canUseBackgroundRuntime, true);
    assert.equal(ready.checks.find((item) => item.id === "permission").ok, true);
    assert.equal(ready.nextAction, "Background Runtime Beta is ready.");
    assert.equal(fetchCalled, false);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

await check("requestEnabled remains false", async () => {
  const runtime = createRuntime({ permissionGranted: true });
  const publicSettings = await runtime.handleMessage({ type: "settings:getPublic" });
  for (const provider of publicSettings.providers) {
    assert.equal(provider.requestEnabled, false);
  }
});

await check("public provider descriptors expose permission availability but not origins", async () => {
  const runtime = createRuntime({ permissionGranted: true });
  const publicSettings = await runtime.handleMessage({ type: "settings:getPublic" });
  for (const provider of publicSettings.providers) {
    if (provider.id === "mock") {
      assert.equal(provider.hasRequiredHostPermission, false);
    } else {
      assert.equal(provider.hasRequiredHostPermission, true);
    }
    assert.equal(Object.hasOwn(provider, "requiredHostPermission"), false);
  }
});

await check("content null rect helper prevents unsafe getBoundingClientRect pattern", async () => {
  const coreSource = readFileSync(new URL("../content-src/01-core.js", import.meta.url), "utf8");
  const appSource = readFileSync(new URL("../content-src/07-app.js", import.meta.url), "utf8");
  assert.match(coreSource, /function safeGetRect\(element\)/);
  assert.match(appSource, /expandedRectContains\(safeGetRect\(element\), clientX, clientY, padding\)/);
  assert.doesNotMatch(appSource, /element\.getBoundingClientRect\(\), clientX, clientY, padding/);
});

await check("content selection extraction ignores AFlodit root selections", async () => {
  const domSource = readFileSync(new URL("../content-src/02-dom.js", import.meta.url), "utf8");
  const extractorSource = readFileSync(new URL("../content-src/03-extractor.js", import.meta.url), "utf8");
  assert.match(domSource, /root\.dataset\.afloditRoot = "true"/);
  assert.match(extractorSource, /isInsideAfloditRoot\(node\)/);
  assert.match(extractorSource, /selection\.anchorNode/);
  assert.match(extractorSource, /selection\.focusNode/);
  assert.match(extractorSource, /#aflodit-pet-root, \[data-aflodit-root='true'\]/);
});
