import assert from "node:assert/strict";
import { createBackgroundRuntime } from "./backgroundRuntime.js";

const MESSAGE_TYPE = "runtime:getProviderPermissionStatus";

function createChromeApi(permissionGranted) {
  return {
    runtime: {},
    permissions: {
      contains(query, callback) {
        assert.deepEqual(query, { origins: ["https://api.deepseek.com/*"] });
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

async function send(payload, permissionGranted = false) {
  const runtime = createBackgroundRuntime({ chromeApi: createChromeApi(permissionGranted) });
  return runtime.handleMessage({ type: MESSAGE_TYPE, payload });
}

await check("DeepSeek permission missing", async () => {
  const response = await send({ providerId: "deepseek" }, false);
  assert.equal(response.ok, true);
  assert.equal(response.permissionConfigured, true);
  assert.equal(response.permissionGranted, false);
  assert.equal(response.requestEnabled, false);
});

await check("DeepSeek permission granted", async () => {
  const response = await send({ providerId: "deepseek" }, true);
  assert.equal(response.ok, true);
  assert.equal(response.permissionGranted, true);
  assert.equal(response.requestEnabled, false);
});

await check("OpenAI permission not configured", async () => {
  const response = await send({ providerId: "openai" });
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
