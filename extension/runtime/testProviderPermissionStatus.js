import assert from "node:assert/strict";
import { createBackgroundRuntime } from "./backgroundRuntime.js";

const MESSAGE_TYPE = "runtime:getProviderPermissionStatus";
const PROVIDER_ORIGINS = {
  deepseek: "https://api.deepseek.com/*",
  dashscope: "https://dashscope.aliyuncs.com/*",
  openai: "https://api.openai.com/*",
  openrouter: "https://openrouter.ai/*"
};

function createChromeApi(permissionGranted, onContains = () => {}) {
  return {
    runtime: {},
    permissions: {
      contains(query, callback) {
        onContains(query);
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

async function send(payload, permissionGranted = false, onContains) {
  const runtime = createBackgroundRuntime({ chromeApi: createChromeApi(permissionGranted, onContains) });
  return runtime.handleMessage({ type: MESSAGE_TYPE, payload });
}

for (const [providerId, origin] of Object.entries(PROVIDER_ORIGINS)) {
  await check(`${providerId} permission missing`, async () => {
    let seen = null;
    const response = await send({ providerId }, false, (query) => {
      seen = query;
    });
    assert.deepEqual(seen, { origins: [origin] });
    assert.equal(response.ok, true);
    assert.equal(response.providerId, providerId);
    assert.equal(response.permissionConfigured, true);
    assert.equal(response.permissionGranted, false);
    assert.equal(response.requestEnabled, false);
  });

  await check(`${providerId} permission granted`, async () => {
    const response = await send({ providerId }, true);
    assert.equal(response.ok, true);
    assert.equal(response.permissionGranted, true);
    assert.equal(response.requestEnabled, false);
  });
}

await check("Mock permission not configured", async () => {
  const response = await send({ providerId: "mock" });
  assert.equal(response.ok, false);
  assert.equal(response.errorCode, "PERMISSION_NOT_CONFIGURED");
  assert.equal(response.requestEnabled, false);
});

await check("Unknown provider", async () => {
  const response = await send({ providerId: "unknown-provider" });
  assert.equal(response.ok, false);
  assert.equal(response.errorCode, "UNKNOWN_PROVIDER");
  assert.equal(response.requestEnabled, false);
});

await check("Dangerous payload is rejected", async () => {
  const response = await send({
    providerId: "deepseek",
    headers: {
      [`Author${"ization"}`]: "Bearer SHOULD_NOT_PASS"
    }
  });
  assert.equal(response.ok, false);
  assert.equal(response.mode, "permission-status");
  assert.equal(response.errorCode, "INVALID_PAYLOAD");
  assert.equal(response.message, "Invalid permission status payload.");
  assert.equal(response.requestEnabled, false);
});

await check("Non-string providerId is rejected", async () => {
  const response = await send({ providerId: 42 });
  assert.equal(response.ok, false);
  assert.equal(response.errorCode, "INVALID_PAYLOAD");
  assert.equal(response.message, "Invalid permission status payload.");
});

await check("Empty providerId is rejected", async () => {
  const response = await send({ providerId: "   " });
  assert.equal(response.ok, false);
  assert.equal(response.errorCode, "INVALID_PAYLOAD");
  assert.equal(response.message, "Invalid permission status payload.");
});
