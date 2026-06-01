"use strict";

const fs = require("fs");
const path = require("path");
const {
  effectiveSettingsFromStored,
  normalizeStoredSettings,
  sanitizeSettings,
  settingsToRuntimeEnv
} = require("./settingsSchema");

const SETTINGS_DIR = path.resolve(__dirname, "..", "..", ".local");
const SETTINGS_FILE = path.join(SETTINGS_DIR, "settings.local.json");

function ensureSettingsDir() {
  fs.mkdirSync(SETTINGS_DIR, { recursive: true });
}

function readJsonFile(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

function readStoredSettings() {
  const warnings = [];
  let raw = null;

  try {
    raw = readJsonFile(SETTINGS_FILE);
  } catch (error) {
    warnings.push("Local settings file is malformed or unreadable; env defaults are being used.");
    return { settings: { model: {} }, warnings, exists: true };
  }

  if (!raw) return { settings: { model: {} }, warnings, exists: false };
  return {
    settings: normalizeStoredSettings(raw, warnings),
    warnings,
    exists: true
  };
}

function getEffectiveSettings(env = process.env) {
  const stored = readStoredSettings();
  return {
    settings: effectiveSettingsFromStored(stored.settings, env),
    warnings: stored.warnings,
    exists: stored.exists
  };
}

function getRuntimeEnv(env = process.env) {
  const effective = getEffectiveSettings(env);
  return {
    env: settingsToRuntimeEnv(effective.settings, env),
    settings: effective.settings,
    warnings: effective.warnings
  };
}

function writeSettings(settings) {
  ensureSettingsDir();
  const tempFile = path.join(SETTINGS_DIR, `settings.local.${process.pid}.${Date.now()}.tmp`);
  const body = `${JSON.stringify(settings, null, 2)}\n`;
  fs.writeFileSync(tempFile, body, { encoding: "utf8", mode: 0o600 });
  try {
    fs.chmodSync(tempFile, 0o600);
  } catch {
    // Windows and some filesystems do not support POSIX file modes.
  }
  fs.renameSync(tempFile, SETTINGS_FILE);
  try {
    fs.chmodSync(SETTINGS_FILE, 0o600);
  } catch {
    // Best effort only.
  }
  return settings;
}

function getSanitizedSettings(env = process.env) {
  const effective = getEffectiveSettings(env);
  return {
    settings: sanitizeSettings(effective.settings),
    warnings: effective.warnings,
    exists: effective.exists
  };
}

module.exports = {
  SETTINGS_DIR,
  SETTINGS_FILE,
  readStoredSettings,
  getEffectiveSettings,
  getRuntimeEnv,
  getSanitizedSettings,
  writeSettings
};
