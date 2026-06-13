const { execFileSync } = require("node:child_process");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "../..");

const script = `
import { createBackgroundRuntime } from "./extension/runtime/backgroundRuntime.js";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const runtime = createBackgroundRuntime({ chromeApi: null, version: "0.8.0" });
const authKey = "Author" + "ization";

const missing = await runtime.handleMessage({
  type: "runtime:testConnectionMock",
  payload: { providerId: "deepseek", model: "deepseek-chat" }
});
assert(missing.ok === false, "missing key should fail");
assert(missing.errorCode === "MISSING_RUNTIME_KEY", "missing key should return MISSING_RUNTIME_KEY");
assert(missing.requestEnabled === false, "missing key response must keep requestEnabled false");

await runtime.handleMessage({
  type: "settings:saveSecret",
  payload: { apiKey: "sk-test-1234567890", providerId: "deepseek" }
});

const success = await runtime.handleMessage({
  type: "runtime:testConnectionMock",
  payload: { providerId: "deepseek", model: "" }
});
assert(success.ok === true, "saved fake key should allow mock success");
assert(success.mode === "mock", "success should be mock mode");
assert(success.model === "deepseek-chat", "empty model should use provider default");
assert(success.requestEnabled === false, "mock success must keep requestEnabled false");
assert(/Real provider requests are still disabled/.test(success.message), "mock success must say real provider requests are disabled");

const unknown = await runtime.handleMessage({
  type: "runtime:testConnectionMock",
  payload: { providerId: "unknown-provider", model: "x" }
});
assert(unknown.ok === false, "unknown provider should fail");
assert(unknown.errorCode === "UNKNOWN_PROVIDER", "unknown provider should return UNKNOWN_PROVIDER");

const extraUrl = await runtime.handleMessage({
  type: "runtime:testConnectionMock",
  payload: { providerId: "deepseek", model: "deepseek-chat", url: "blocked" }
});
assert(extraUrl.ok === false, "extra url field should fail");
assert(extraUrl.errorCode === "INVALID_PAYLOAD", "extra url field should return INVALID_PAYLOAD");

const nestedHeaders = await runtime.handleMessage({
  type: "runtime:testConnectionMock",
  payload: {
    providerId: "deepseek",
    model: "deepseek-chat",
    request: {
      headers: { [authKey]: "Bearer bad" }
    }
  }
});
assert(nestedHeaders.ok === false, "nested headers should fail");
assert(nestedHeaders.errorCode === "INVALID_PAYLOAD", "nested headers should return INVALID_PAYLOAD");

const objectProvider = await runtime.handleMessage({
  type: "runtime:testConnectionMock",
  payload: { providerId: { id: "deepseek" }, model: "deepseek-chat" }
});
assert(objectProvider.ok === false, "object providerId should fail");
assert(objectProvider.errorCode === "INVALID_PAYLOAD", "object providerId should return INVALID_PAYLOAD");

const arrayModel = await runtime.handleMessage({
  type: "runtime:testConnectionMock",
  payload: { providerId: "deepseek", model: ["deepseek-chat"] }
});
assert(arrayModel.ok === false, "array model should fail");
assert(arrayModel.errorCode === "INVALID_PAYLOAD", "array model should return INVALID_PAYLOAD");

const emptyProvider = await runtime.handleMessage({
  type: "runtime:testConnectionMock",
  payload: { providerId: "   ", model: "deepseek-chat" }
});
assert(emptyProvider.ok === false, "empty providerId should fail");
assert(emptyProvider.errorCode === "INVALID_PAYLOAD", "empty providerId should return INVALID_PAYLOAD");

console.log("Mock runtime test payload hardening passed.");
`;

execFileSync(process.execPath, ["--input-type=module", "-e", script], {
  cwd: repoRoot,
  stdio: "inherit"
});
