"use strict";

const PROVIDERS = Object.freeze(["mock", "openai-compatible"]);
const CLEAR_API_KEY = "__CLEAR__";
const AFLODIT_FIXED_TIMEOUT_MS = 40000;
const MIN_TIMEOUT_MS = AFLODIT_FIXED_TIMEOUT_MS;
const MAX_TIMEOUT_MS = AFLODIT_FIXED_TIMEOUT_MS;
const DEFAULT_TIMEOUT_MS = AFLODIT_FIXED_TIMEOUT_MS;
const MAX_BASE_URL_LENGTH = 1000;
const MAX_MODEL_LENGTH = 200;
const MAX_API_KEY_LENGTH = 4096;

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function numberFrom(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizeProvider(value) {
  const provider = text(value).toLowerCase().replace(/_/g, "-");
  if (provider === "openai") return "openai-compatible";
  return PROVIDERS.includes(provider) ? provider : "";
}

function defaultSettingsFromEnv(env = process.env) {
  const provider = normalizeProvider(env.MODEL_PROVIDER) || "mock";
  const model = text(env.MODEL_NAME) || (provider === "mock" ? "mock" : "");

  return {
    model: {
      provider,
      baseUrl: text(env.MODEL_BASE_URL),
      model,
      apiKey: text(env.MODEL_API_KEY),
      timeoutMs: DEFAULT_TIMEOUT_MS
    }
  };
}

function clampTimeout(value) {
  return DEFAULT_TIMEOUT_MS;
}

function validateTimeoutMs(value, errors) {
  return DEFAULT_TIMEOUT_MS;
}

function makeApiKeyPreview(apiKey) {
  const value = text(apiKey);
  if (!value) return "";
  if (value.length <= 8) return "set";
  return `${value.slice(0, 3)}...${value.slice(-4)}`;
}

function validateBaseUrl(value, errors, { required = false } = {}) {
  const baseUrl = text(value);
  if (!baseUrl) {
    if (required) errors.push("baseUrl is required for openai-compatible provider.");
    return "";
  }
  if (baseUrl.length > MAX_BASE_URL_LENGTH) {
    errors.push(`baseUrl must be ${MAX_BASE_URL_LENGTH} characters or less.`);
    return "";
  }

  let url;
  try {
    url = new URL(baseUrl);
  } catch {
    errors.push("baseUrl must be a valid URL.");
    return "";
  }

  if (!["http:", "https:"].includes(url.protocol)) {
    errors.push("baseUrl must use http or https.");
  }
  if (url.username || url.password) {
    errors.push("baseUrl must not include username or password credentials.");
  }

  return baseUrl.replace(/\/+$/g, "");
}

function validateModelName(value, errors, { required = false } = {}) {
  const model = text(value);
  if (!model) {
    if (required) errors.push("model is required.");
    return "";
  }
  if (model.length > MAX_MODEL_LENGTH) {
    errors.push(`model must be ${MAX_MODEL_LENGTH} characters or less.`);
    return "";
  }
  return model;
}

function validateApiKey(value, errors) {
  const apiKey = text(value);
  if (apiKey.length > MAX_API_KEY_LENGTH) {
    errors.push(`apiKey must be ${MAX_API_KEY_LENGTH} characters or less.`);
    return "";
  }
  return apiKey;
}

function normalizeStoredSettings(raw, warnings = []) {
  if (!raw || typeof raw !== "object") {
    return { model: {} };
  }

  const source = raw.model && typeof raw.model === "object" ? raw.model : {};
  const provider = normalizeProvider(source.provider);
  const model = {};

  if (provider) model.provider = provider;
  else if (source.provider !== undefined) warnings.push("Stored provider was invalid and ignored.");

  if (typeof source.baseUrl === "string") model.baseUrl = text(source.baseUrl);
  if (typeof source.model === "string") model.model = text(source.model);
  if (typeof source.apiKey === "string") model.apiKey = text(source.apiKey);

  return { model };
}

function mergeSettings(base, override) {
  return {
    model: {
      ...(base?.model || {}),
      ...(override?.model || {})
    }
  };
}

function effectiveSettingsFromStored(stored, env = process.env) {
  const envDefaults = defaultSettingsFromEnv(env);
  const normalizedStored = normalizeStoredSettings(stored);
  const merged = mergeSettings(envDefaults, normalizedStored);
  if (!merged.model.provider) merged.model.provider = "mock";
  if (merged.model.provider === "mock" && !merged.model.model) merged.model.model = "mock";
  merged.model.timeoutMs = DEFAULT_TIMEOUT_MS;
  return merged;
}

function settingsToRuntimeEnv(settings, env = process.env) {
  const model = settings?.model || {};
  return {
    ...env,
    MODEL_PROVIDER: model.provider || "mock",
    MODEL_BASE_URL: model.baseUrl || "",
    MODEL_API_KEY: model.apiKey || "",
    MODEL_NAME: model.model || (model.provider === "mock" ? "mock" : ""),
    MODEL_TIMEOUT_MS: String(DEFAULT_TIMEOUT_MS)
  };
}

function sanitizeSettings(settings) {
  const model = settings?.model || {};
  const apiKey = text(model.apiKey);
  return {
    model: {
      provider: model.provider || "mock",
      baseUrl: model.baseUrl || "",
      model: model.model || "",
      apiKeySet: Boolean(apiKey),
      apiKeyPreview: makeApiKeyPreview(apiKey)
    }
  };
}

function validateSettingsForSave(payload, existingStored = {}, env = process.env) {
  const errors = [];
  const source = payload?.model && typeof payload.model === "object" ? payload.model : {};
  const existing = normalizeStoredSettings(existingStored);
  const effective = effectiveSettingsFromStored(existing, env);
  const envApiKey = defaultSettingsFromEnv(env).model.apiKey || "";

  const provider = source.provider === undefined
    ? effective.model.provider
    : normalizeProvider(source.provider);
  if (!provider) errors.push("provider must be mock or openai-compatible.");

  const nextProvider = provider || "mock";
  const baseUrl = source.baseUrl === undefined
    ? (existing.model.baseUrl || "")
    : validateBaseUrl(source.baseUrl, errors, { required: nextProvider === "openai-compatible" });
  const model = source.model === undefined
    ? (existing.model.model || (nextProvider === "mock" ? "mock" : ""))
    : validateModelName(source.model, errors, { required: nextProvider === "openai-compatible" });
  let apiKey = existing.model.apiKey || "";
  let apiKeyCleared = false;
  if (Object.prototype.hasOwnProperty.call(source, "apiKey")) {
    const candidate = text(source.apiKey);
    if (candidate === CLEAR_API_KEY) {
      apiKey = "";
      apiKeyCleared = true;
    }
    else if (candidate) apiKey = validateApiKey(candidate, errors);
  }

  if (nextProvider === "openai-compatible" && !(apiKey || (!apiKeyCleared && existing.model.apiKey) || envApiKey)) {
    errors.push("apiKey is required for openai-compatible provider unless an existing key is preserved.");
  }

  const settings = {
    model: {
      provider: nextProvider,
      baseUrl,
      model: model || (nextProvider === "mock" ? "mock" : "")
    }
  };
  if (apiKey) settings.model.apiKey = apiKey;

  return { ok: errors.length === 0, errors, settings };
}

function validateSettingsForTest(payload, savedOrEffective = {}, env = process.env) {
  const source = payload?.model && typeof payload.model === "object" ? payload.model : {};
  const base = savedOrEffective?.model ? savedOrEffective : effectiveSettingsFromStored(savedOrEffective, env);
  const merged = mergeSettings(base, { model: source });
  const errors = [];
  const provider = normalizeProvider(merged.model.provider);
  if (!provider) errors.push("provider must be mock or openai-compatible.");
  const required = provider === "openai-compatible";
  const baseUrl = validateBaseUrl(merged.model.baseUrl, errors, { required });
  const model = validateModelName(merged.model.model, errors, { required });
  const apiKey = validateApiKey(merged.model.apiKey, errors);
  const timeoutMs = DEFAULT_TIMEOUT_MS;

  if (required && !apiKey) errors.push("apiKey is required for openai-compatible provider.");

  return {
    ok: errors.length === 0,
    errors,
    settings: {
      model: {
        provider: provider || "mock",
        baseUrl,
        model: model || (provider === "mock" ? "mock" : ""),
        apiKey,
        timeoutMs
      }
    }
  };
}

module.exports = {
  CLEAR_API_KEY,
  PROVIDERS,
  AFLODIT_FIXED_TIMEOUT_MS,
  DEFAULT_TIMEOUT_MS,
  MIN_TIMEOUT_MS,
  MAX_TIMEOUT_MS,
  defaultSettingsFromEnv,
  effectiveSettingsFromStored,
  normalizeStoredSettings,
  sanitizeSettings,
  settingsToRuntimeEnv,
  validateSettingsForSave,
  validateSettingsForTest,
  makeApiKeyPreview
};
