import assert from "node:assert/strict";
import { createBackgroundRuntime } from "./backgroundRuntime.js";

const MESSAGE_TYPE = "runtime:requestProviderPermission";
const DEEPSEEK_ORIGIN = "https://api.deepseek.com/*";

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

await check("DeepSeek grant", async () => {
  let requestedOrigins = null;
  const response = await send({ providerId: "deepseek" }, true, (query) => {
    requestedOrigins = query.origins;
  });
  assert.deepEqual(requestedOrigins, [DEEPSEEK_ORIGIN]);
  assert.equal(response.ok, true);
  assert.equal(response.providerId, "deepseek");
  assert.equal(response.permissionGranted, true);
  assert.equal(response.requestEnabled, false);
});

await check("DeepSeek deny", async () => {
  const response = await send({ providerId: "deepseek" }, false);
  assert.equal(response.ok, false);
  assert.equal(response.errorCode, "PERMISSION_DENIED");
  assert.equal(response.permissionGranted, false);
  assert.equal(response.requestEnabled, false);
});

await check("OpenAI permission request not configured", async () => {
  let requestCalled = false;
  const response = await send({ providerId: "openai" }, true, () => {
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

await check("Payload with headers Authorization is rejected", async () => {
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
  let querySeen = null;
  await send({ providerId: "deepseek" }, true, (query) => {
    querySeen = query;
  });
  assert.deepEqual(querySeen, { origins: [DEEPSEEK_ORIGIN] });
});
