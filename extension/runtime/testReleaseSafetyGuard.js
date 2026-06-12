import assert from "node:assert/strict";
import { runReleaseSafetyCheck } from "./checkReleaseSafety.js";

async function check(name, fn) {
  try {
    await fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

function scan(content, relativePath = "extension/runtime/simulated.js") {
  return runReleaseSafetyCheck({
    files: [{ relativePath, content }]
  });
}

await check("release safety guard passes current repository", async () => {
  const result = runReleaseSafetyCheck({ repoRoot: process.cwd() });
  assert.equal(result.ok, true, result.violations.join("\n"));
});

await check("release safety guard detects simulated forbidden wildcard origin", async () => {
  const wildcardOrigin = "https://" + "*/*";
  const result = scan(`const bad = "${wildcardOrigin}";`);
  assert.equal(result.ok, false);
  assert.match(result.violations.join("\n"), /wildcard HTTPS origin/);
});

await check("release safety guard detects simulated enabled request flag", async () => {
  const flagName = "requestEnabled";
  const enabledValue = "true";
  const result = scan(`export const provider = { ${flagName}: ${enabledValue} };`);
  assert.equal(result.ok, false);
  assert.match(result.violations.join("\n"), /requestEnabled/);
});

await check("release safety guard detects simulated unsafe Authorization logging", async () => {
  const result = scan("console.log('Authorization', token);");
  assert.equal(result.ok, false);
  assert.match(result.violations.join("\n"), /console logging/);
});
