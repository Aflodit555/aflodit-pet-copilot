import { copyFileSync, mkdirSync, readFileSync, rmSync, statSync } from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const extensionRoot = path.join(repoRoot, "extension");
const manifestPath = path.join(extensionRoot, "manifest.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const version = manifest.version || "0.8.0";
const packageName = `aflodit-pet-copilot-v${version}`;
const distRoot = path.join(repoRoot, "dist");
const packageRoot = path.join(distRoot, packageName);

const packageFiles = [
  "manifest.json",
  "background.js",
  "content.js",
  "pet.css",
  "runtime/backgroundRuntime.js",
  "runtime/deepseekTestConnection.js",
  "runtime/messageProtocol.js",
  "runtime/permissionGuard.js",
  "runtime/providerRegistry.js",
  "runtime/safeLog.js",
  "runtime/secretStore.js",
  "runtime/settingsStore.js"
];

function normalize(filePath) {
  return path.normalize(filePath);
}

function assertInside(child, parent) {
  const relative = path.relative(parent, child);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Refusing to write outside ${parent}: ${child}`);
  }
}

function ensureFile(filePath) {
  const stat = statSync(filePath, { throwIfNoEntry: false });
  if (!stat?.isFile()) {
    throw new Error(`Required release file is missing: ${path.relative(repoRoot, filePath)}`);
  }
}

mkdirSync(distRoot, { recursive: true });
assertInside(packageRoot, distRoot);
rmSync(packageRoot, { recursive: true, force: true });

for (const relativeFile of packageFiles) {
  const source = normalize(path.join(extensionRoot, relativeFile));
  const target = normalize(path.join(packageRoot, relativeFile));
  assertInside(source, extensionRoot);
  assertInside(target, packageRoot);
  ensureFile(source);
  mkdirSync(path.dirname(target), { recursive: true });
  copyFileSync(source, target);
}

console.log(`Built release package: ${path.relative(repoRoot, packageRoot)}`);
console.log("Packaged files:");
for (const file of packageFiles) {
  console.log(`- ${file}`);
}
