import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SELF_FILE = path.normalize(fileURLToPath(import.meta.url));
const TEXT_EXTENSIONS = new Set([".js", ".json", ".md", ".html", ".css"]);
const REQUEST_ENABLED_PATTERN_PREFIX = "\\brequestEnabled\\s*[:=]\\s*";
const REQUEST_ENABLED_TRUE_PATTERN = new RegExp(REQUEST_ENABLED_PATTERN_PREFIX + "true\\b");
const PERMISSION_REQUEST_CALL = "chrome.permissions." + "request";
const APPROVED_PERMISSION_REQUEST_SNIPPET = PERMISSION_REQUEST_CALL + "({ origins: [requiredHostPermission] }";
const FETCH_CALL = "fetch" + "(";

function normalizePath(filePath) {
  return path.normalize(filePath).replace(/\\/g, "/");
}

function listFiles(rootDir, relativeDir = "") {
  const absoluteDir = path.join(rootDir, relativeDir);
  const entries = readdirSync(absoluteDir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const relativePath = path.join(relativeDir, entry.name);
    const absolutePath = path.join(rootDir, relativePath);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".git") continue;
      files.push(...listFiles(rootDir, relativePath));
      continue;
    }
    if (!entry.isFile()) continue;
    if (!TEXT_EXTENSIONS.has(path.extname(entry.name))) continue;
    files.push({ path: absolutePath, relativePath: normalizePath(relativePath), content: readFileSync(absolutePath, "utf8") });
  }
  return files;
}

function defaultFiles(repoRoot = process.cwd()) {
  const extensionRoot = path.join(repoRoot, "extension");
  if (!statSync(extensionRoot, { throwIfNoEntry: false })?.isDirectory()) return [];
  return listFiles(extensionRoot).map((file) => ({
    ...file,
    relativePath: normalizePath(path.join("extension", file.relativePath))
  }));
}

function addViolation(violations, file, message) {
  violations.push(`${file.relativePath}: ${message}`);
}

function isApprovedPermissionRequest(file) {
  return file.relativePath === "extension/runtime/backgroundRuntime.js"
    && file.content.includes(APPROVED_PERMISSION_REQUEST_SNIPPET)
    && file.content.includes("isExactHostPermission(provider.requiredHostPermission)");
}

function isApprovedFetchFile(file) {
  if (file.relativePath === "extension/runtime/openAiCompatibleRequest.js") return true;
  if (file.relativePath === "extension/runtime/deepseekTestConnection.js") return true;
  if (/^extension\/runtime\/test.+\.js$/.test(file.relativePath)) return true;
  return false;
}

function shouldSkipDefaultScan(file) {
  return file.relativePath === "extension/runtime/checkReleaseSafety.js"
    || file.relativePath === "extension/runtime/testReleaseSafetyGuard.js";
}

function isApprovedWildcardOrigin(file) {
  if (file.relativePath !== "extension/manifest.json") return false;
  try {
    const manifest = JSON.parse(file.content);
    const optionalHosts = Array.isArray(manifest.optional_host_permissions) ? manifest.optional_host_permissions : [];
    return optionalHosts.includes(`https://${"*"}/*`);
  } catch (_) {
    return false;
  }
}

export function runReleaseSafetyCheck({ repoRoot = process.cwd(), files = null } = {}) {
  const scannedFiles = files || defaultFiles(repoRoot);
  const violations = [];

  for (const file of scannedFiles) {
    const absolute = file.path ? path.normalize(file.path) : "";
    if (absolute && absolute === SELF_FILE) continue;
    if (!files && shouldSkipDefaultScan(file)) continue;

    if (/[\"']https:\/\/\*\/\*[\"']/.test(file.content) && !isApprovedWildcardOrigin(file)) {
      addViolation(violations, file, "forbidden wildcard HTTPS origin");
    }

    if (REQUEST_ENABLED_TRUE_PATTERN.test(file.content)) {
      addViolation(violations, file, "requestEnabled must remain disabled");
    }

    if (/console\.(log|debug|info|warn|error)\s*\([^;\n]*(Authorization|apiKey|secret|token)/i.test(file.content)) {
      addViolation(violations, file, "suspicious console logging of secret material");
    }

    if (/settings\s*:\s*{[^}]*\b(apiKey|secret|token)\b/s.test(file.content)) {
      addViolation(violations, file, "public settings may expose a full secret field");
    }

    if (file.content.includes(PERMISSION_REQUEST_CALL) && !isApprovedPermissionRequest(file)) {
      addViolation(violations, file, "permission request outside approved DeepSeek helper");
    }

    if (file.content.includes(FETCH_CALL) && file.relativePath.startsWith("extension/runtime/") && !isApprovedFetchFile(file)) {
      addViolation(violations, file, "network call outside approved DeepSeek helper or runtime tests");
    }

    if (file.content.includes(FETCH_CALL) && file.relativePath === "extension/background.js") {
      addViolation(violations, file, "network call in extension background.js is not approved");
    }
  }

  return {
    ok: violations.length === 0,
    violations
  };
}

if (process.argv[1] && path.normalize(process.argv[1]) === SELF_FILE) {
  const result = runReleaseSafetyCheck({ repoRoot: process.cwd() });
  if (!result.ok) {
    console.error("Release safety guard failed:");
    for (const violation of result.violations) console.error(`- ${violation}`);
    process.exit(1);
  }
  console.log("Release safety guard passed.");
}
