import assert from "node:assert/strict";
import { createBackgroundRuntime } from "./backgroundRuntime.js";

const MESSAGE_TYPE = "runtime:requestProviderPermission";
const PROVIDER_ORIGINS = {
  deepseek: "https://api.deepseek.com/*",
  dashscope: "https://dashscope.aliyuncs.com/*",
  openai: "https://api.openai.com/*",
  openrouter: "https://openrouter.ai/*"
};

function createChromeApi(permissionGranted, onRequest = () => {}) {
  return {
    runtime: {},
    permissions: {
      request(query, callback) {
        onRequest(query);
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

async function send(payload, permissionGranted = false, onRequest) {
  const runtime = createBackgroundRuntime({ chromeApi: createChromeApi(permissionGranted, onRequest) });
  return runtime.handleMessage({ type: MESSAGE_TYPE, payload });
}

for (const [providerId, origin] of Object.entries(PROVIDER_ORIGINS)) {
  await check(`${providerId} grant`, async () => {
    let requestedOrigins = null;
    const response = await send({ providerId }, true, (query) => {
      requestedOrigins = query.origins;
    });
    assert.deepEqual(requestedOrigins, [origin]);
    assert.equal(response.ok, true);
    assert.equal(response.providerId, providerId);
    assert.equal(response.permissionGranted, true);
    assert.equal(response.requestEnabled, false);
  });

  await check(`${providerId} deny`, async () => {
    const response = await send({ providerId }, false);
    assert.equal(response.ok, false);
    assert.equal(response.errorCode, "PERMISSION_DENIED");
    assert.equal(response.permissionGranted, false);
    assert.equal(response.requestEnabled, false);
  });
}

await check("Mock permission request not configured", async () => {
  let requestCalled = false;
  const response = await send({ providerId: "mock" }, true, () => {
    requestCalled = true;
  });
  assert.equal(requestCalled, false);
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

await check("Payload with url is rejected", async () => {
  const response = await send({
    providerId: "deepseek",
    url: "https://api.deepseek.com/chat/completions"
  });
  assert.equal(response.ok, false);
  assert.equal(response.mode, "permission-request");
  assert.equal(response.errorCode, "INVALID_PAYLOAD");
  assert.equal(response.message, "Invalid permission request payload.");
  assert.equal(response.requestEnabled, false);
});

await check("Payload with auth header is rejected", async () => {
  const response = await send({
    providerId: "deepseek",
    headers: {
      [`Author${"ization"}`]: "Bearer SHOULD_NOT_PASS"
    }
  });
  assert.equal(response.ok, false);
  assert.equal(response.errorCode, "INVALID_PAYLOAD");
  assert.equal(response.message, "Invalid permission request payload.");
});

await check("Non-string providerId is rejected", async () => {
  const response = await send({ providerId: { id: "deepseek" } });
  assert.equal(response.ok, false);
  assert.equal(response.errorCode, "INVALID_PAYLOAD");
  assert.equal(response.message, "Invalid permission request payload.");
});

await check("Empty providerId is rejected", async () => {
  const response = await send({ providerId: "   " });
  assert.equal(response.ok, false);
  assert.equal(response.errorCode, "INVALID_PAYLOAD");
  assert.equal(response.message, "Invalid permission request payload.");
});

await check("Request origins are exact", async () => {
  for (const [providerId, origin] of Object.entries(PROVIDER_ORIGINS)) {
    let querySeen = null;
    await send({ providerId }, true, (query) => {
      querySeen = query;
    });
    assert.deepEqual(querySeen, { origins: [origin] });
  }
});
