import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const manifest = JSON.parse(readFileSync(path.join(repoRoot, "extension", "manifest.json"), "utf8"));
const version = manifest.version || "0.8.0";
const packageRoot = process.argv[2]
  ? path.resolve(repoRoot, process.argv[2])
  : path.join(repoRoot, "dist", `aflodit-pet-copilot-v${version}`);

const textExtensions = new Set([".js", ".json", ".css", ".html", ".md", ".txt"]);
const requiredFiles = [
  "manifest.json",
  "background.js",
  "content.js",
  "pet.css",
  "runtime/backgroundRuntime.js",
  "runtime/messageProtocol.js",
  "runtime/openAiCompatibleRequest.js",
  "runtime/permissionGuard.js",
  "runtime/providerRegistry.js",
  "runtime/safeLog.js",
  "runtime/secretStore.js",
  "runtime/settingsStore.js"
];

function normalize(relativePath) {
  return relativePath.replace(/\\/g, "/");
}

function listFiles(rootDir, relativeDir = "") {
  const entries = readdirSync(path.join(rootDir, relativeDir), { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const relativePath = path.join(relativeDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listFiles(rootDir, relativePath));
      continue;
    }
    if (entry.isFile()) files.push(normalize(relativePath));
  }
  return files;
}

function isForbiddenPath(relativePath) {
  const parts = relativePath.split("/");
  const basename = parts[parts.length - 1];
  return parts.includes("node_modules")
    || parts.includes("backend")
    || parts.includes("content-src")
    || basename === ".env"
    || basename.startsWith(".env.")
    || /^test/i.test(basename)
    || /codex-task/i.test(basename)
    || /^README(?:\.|$)/i.test(basename);
}

function scanContent(relativePath, content) {
  const violations = [];
  if (/[\"']https:\/\/\*\/\*[\"']/.test(content)) {
    violations.push("forbidden wildcard HTTPS origin");
  }
  if (/\brequestEnabled\s*[:=]\s*true\b/.test(content)) {
    violations.push("requestEnabled must not be true");
  }
  if (/(sk|ak|pk|rk)-(live|prod|real|secret|proj)-[A-Za-z0-9_-]{12,}/i.test(content)) {
    violations.push("obvious API key pattern");
  }
  if (/(api[_-]?key|secret|token)\s*[:=]\s*[\"'][A-Za-z0-9_-]{24,}[\"']/i.test(content)) {
    violations.push("hardcoded secret-like assignment");
  }
  return violations.map((message) => `${relativePath}: ${message}`);
}

const packageStat = statSync(packageRoot, { throwIfNoEntry: false });
if (!packageStat?.isDirectory()) {
  console.error(`Release package does not exist: ${path.relative(repoRoot, packageRoot)}`);
  process.exit(1);
}

const files = listFiles(packageRoot).sort();
const violations = [];

for (const required of requiredFiles) {
  if (!files.includes(required)) {
    violations.push(`${required}: required file is missing from release package`);
  }
}

for (const file of files) {
  if (isForbiddenPath(file)) {
    violations.push(`${file}: forbidden release package path`);
  }
  if (!textExtensions.has(path.extname(file))) continue;
  const content = readFileSync(path.join(packageRoot, file), "utf8");
  violations.push(...scanContent(file, content));
}

if (files.some((file) => /(^|\/)test/i.test(file))) {
  violations.push("release package must not include developer tests");
}

if (violations.length) {
  console.error("Release package safety check failed:");
  for (const violation of violations) console.error(`- ${violation}`);
  process.exit(1);
}

console.log(`Release package safety check passed: ${path.relative(repoRoot, packageRoot)}`);
console.log(`Scanned ${files.length} files.`);
