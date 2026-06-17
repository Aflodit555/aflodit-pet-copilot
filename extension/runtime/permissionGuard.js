import { CUSTOM_OPENAI_COMPATIBLE_PROVIDER_ID, hasProvider, normalizeCustomProviderConfig } from "./providerRegistry.js";

const FORBIDDEN_PUBLIC_KEYS = Object.freeze([
  "apikey",
  "secret",
  "baseurl",
  "url",
  "endpoint",
  "origin",
  "chatpath",
  "headers",
  "rawbody",
  "body",
  "request",
  "config",
  ["author", "ization"].join(""),
  "token",
  "bearer"
]);

function forbiddenPublicKeyIn(value = {}) {
  for (const key of Object.keys(value || {})) {
    if (FORBIDDEN_PUBLIC_KEYS.includes(key.toLowerCase())) return key;
  }
  return "";
}

export function validatePublicSettings(settings = {}) {
  const allowedKeys = new Set(["provider", "model", "saveMode", "debugEnabled", "runtimeMode", "backgroundRuntimePreviewEnabled", "backgroundChatPreviewEnabled", "customProvider"]);

  if (settings.provider !== undefined && (typeof settings.provider !== "string" || !hasProvider(settings.provider))) {
    return {
      ok: false,
      error: {
        code: "PROVIDER_NOT_ALLOWED",
        message: `Provider is not registered for background runtime: ${settings.provider}`
      }
    };
  }

  for (const key of Object.keys(settings || {})) {
    if (forbiddenPublicKeyIn({ [key]: settings[key] })) {
      return {
        ok: false,
        error: {
          code: "SETTING_FORBIDDEN",
          message: `Public background settings cannot include ${key}.`
        }
      };
    }

    if (!allowedKeys.has(key)) {
      return {
        ok: false,
        error: {
          code: "SETTING_UNKNOWN",
          message: `Public background settings field is not supported: ${key}`
        }
      };
    }
  }


  if (settings.customProvider !== undefined && settings.customProvider !== null) {
    if (typeof settings.customProvider !== "object" || Array.isArray(settings.customProvider)) {
      return {
        ok: false,
        error: {
          code: "CUSTOM_PROVIDER_INVALID",
          message: "Custom provider settings must be an object."
        }
      };
    }
    const customGuard = normalizeCustomProviderConfig(settings.customProvider);
    if (!customGuard.ok) return customGuard;
  }

  if (settings.provider === CUSTOM_OPENAI_COMPATIBLE_PROVIDER_ID && settings.customProvider === null) {
    return {
      ok: false,
      error: {
        code: "CUSTOM_PROVIDER_INVALID",
        message: "Custom OpenAI-compatible provider requires a valid HTTPS Base URL."
      }
    };
  }

  if (settings.model !== undefined) {
    const trimmedModel = typeof settings.model === "string" ? settings.model.trim() : "";
    if (typeof settings.model !== "string" || settings.model.trim().length > 120 || (!trimmedModel && settings.provider === undefined)) {
      return {
        ok: false,
        error: {
          code: "MODEL_INVALID",
          message: "Runtime model must be a string up to 120 characters; empty model is only allowed when selecting a provider default."
        }
      };
    }
  }

  if (settings.saveMode !== undefined && settings.saveMode !== "local" && settings.saveMode !== "session") {
    return {
      ok: false,
      error: {
        code: "SAVE_MODE_INVALID",
        message: "Runtime saveMode must be local or session."
      }
    };
  }

  if (settings.debugEnabled !== undefined && typeof settings.debugEnabled !== "boolean") {
    return {
      ok: false,
      error: {
        code: "DEBUG_FLAG_INVALID",
        message: "Runtime debugEnabled must be boolean."
      }
    };
  }

  if (
    settings.runtimeMode !== undefined
    && settings.runtimeMode !== "local_backend"
    && settings.runtimeMode !== "background_runtime_beta"
  ) {
    return {
      ok: false,
      error: {
        code: "RUNTIME_MODE_INVALID",
        message: "Runtime mode must be local_backend or background_runtime_beta."
      }
    };
  }

  if (settings.backgroundRuntimePreviewEnabled !== undefined && typeof settings.backgroundRuntimePreviewEnabled !== "boolean") {
    return {
      ok: false,
      error: {
        code: "BACKGROUND_RUNTIME_PREVIEW_FLAG_INVALID",
        message: "Legacy Background Runtime flag must be boolean."
      }
    };
  }

  if (settings.backgroundChatPreviewEnabled !== undefined && typeof settings.backgroundChatPreviewEnabled !== "boolean") {
    return {
      ok: false,
      error: {
        code: "BACKGROUND_CHAT_PREVIEW_FLAG_INVALID",
        message: "Background Chat Preview legacy flag must be boolean."
      }
    };
  }

  return { ok: true };
}

export function validateRuntimeTestPayload(payload = {}) {
  const allowedKeys = new Set(["providerId", "model"]);
  for (const key of Object.keys(payload || {})) {
    if (!allowedKeys.has(key)) {
      return invalidRuntimeTestPayload();
    }
  }

  if (typeof payload.providerId !== "string") {
    return invalidRuntimeTestPayload();
  }

  const providerId = payload.providerId.trim();
  if (!providerId || providerId.length > 64) {
    return invalidRuntimeTestPayload();
  }

  if (payload.model !== undefined) {
    if (typeof payload.model !== "string" || payload.model.trim().length > 128) {
      return invalidRuntimeTestPayload();
    }
  }

  return { ok: true };
}

export function validateProviderConnectionTestPayload(payload = {}) {
  const allowedKeys = new Set(["providerId", "model"]);
  for (const key of Object.keys(payload || {})) {
    if (!allowedKeys.has(key)) {
      return invalidProviderConnectionTestPayload();
    }
  }

  if (typeof payload.providerId !== "string") {
    return invalidProviderConnectionTestPayload();
  }

  const providerId = payload.providerId.trim();
  if (!providerId || providerId.length > 64) {
    return invalidProviderConnectionTestPayload();
  }

  if (payload.model !== undefined) {
    if (typeof payload.model !== "string" || payload.model.trim().length > 128) {
      return invalidProviderConnectionTestPayload();
    }
  }

  return { ok: true };
}

export function validateRuntimeChatPayload(payload = {}) {
  const allowedKeys = new Set(["providerId", "model", "userText"]);
  for (const key of Object.keys(payload || {})) {
    if (!allowedKeys.has(key)) {
      return invalidRuntimeChatPayload();
    }
  }

  if (typeof payload.providerId !== "string") {
    return invalidRuntimeChatPayload();
  }

  const providerId = payload.providerId.trim();
  if (!providerId || providerId.length > 64) {
    return invalidRuntimeChatPayload();
  }

  if (payload.model !== undefined) {
    if (typeof payload.model !== "string" || payload.model.trim().length > 128) {
      return invalidRuntimeChatPayload();
    }
  }

  if (typeof payload.userText !== "string") {
    return invalidRuntimeChatPayload();
  }

  const userText = payload.userText.trim();
  if (!userText || userText.length > 512) {
    return invalidRuntimeChatPayload();
  }

  return { ok: true };
}

export function validateRuntimeActionPayload(payload = {}) {
  const allowedKeys = new Set(["providerId", "model", "action", "userText", "pageText", "selectionText"]);
  for (const key of Object.keys(payload || {})) {
    if (!allowedKeys.has(key)) {
      return invalidRuntimeActionPayload();
    }
  }

  if (typeof payload.providerId !== "string") {
    return invalidRuntimeActionPayload();
  }

  const providerId = payload.providerId.trim();
  if (!providerId || providerId.length > 64) {
    return invalidRuntimeActionPayload();
  }

  if (payload.model !== undefined && (typeof payload.model !== "string" || payload.model.trim().length > 128)) {
    return invalidRuntimeActionPayload();
  }

  const allowedActions = new Set(["chat", "explain", "translate", "summarize"]);
  if (typeof payload.action !== "string" || !allowedActions.has(payload.action)) {
    return invalidRuntimeActionPayload();
  }

  if (typeof payload.userText !== "string" || payload.userText.trim().length > 1000) {
    return invalidRuntimeActionPayload();
  }

  if (payload.pageText !== undefined && (typeof payload.pageText !== "string" || payload.pageText.trim().length > 6000)) {
    return invalidRuntimeActionPayload();
  }

  if (payload.selectionText !== undefined && (typeof payload.selectionText !== "string" || payload.selectionText.trim().length > 3000)) {
    return invalidRuntimeActionPayload();
  }

  const userText = payload.userText.trim();
  const pageText = typeof payload.pageText === "string" ? payload.pageText.trim() : "";
  const selectionText = typeof payload.selectionText === "string" ? payload.selectionText.trim() : "";
  if (!userText && !pageText && !selectionText) {
    return invalidRuntimeActionPayload();
  }

  if (payload.action === "chat" && !userText) {
    return invalidRuntimeActionPayload();
  }

  return { ok: true };
}

export function validateBackgroundChatReadinessPayload(payload = {}) {
  const allowedKeys = new Set(["providerId", "model"]);
  for (const key of Object.keys(payload || {})) {
    if (!allowedKeys.has(key)) {
      return invalidBackgroundChatReadinessPayload();
    }
  }

  if (typeof payload.providerId !== "string") {
    return invalidBackgroundChatReadinessPayload();
  }

  const providerId = payload.providerId.trim();
  if (!providerId || providerId.length > 64) {
    return invalidBackgroundChatReadinessPayload();
  }

  if (payload.model !== undefined) {
    if (typeof payload.model !== "string" || payload.model.trim().length > 128) {
      return invalidBackgroundChatReadinessPayload();
    }
  }

  return { ok: true };
}

export function validateProviderPermissionStatusPayload(payload = {}) {
  const allowedKeys = new Set(["providerId"]);
  for (const key of Object.keys(payload || {})) {
    if (!allowedKeys.has(key)) {
      return invalidProviderPermissionStatusPayload();
    }
  }

  if (typeof payload.providerId !== "string") {
    return invalidProviderPermissionStatusPayload();
  }

  const providerId = payload.providerId.trim();
  if (!providerId || providerId.length > 64) {
    return invalidProviderPermissionStatusPayload();
  }

  return { ok: true };
}

export function validateProviderPermissionRequestPayload(payload = {}) {
  const allowedKeys = new Set(["providerId"]);
  for (const key of Object.keys(payload || {})) {
    if (!allowedKeys.has(key)) {
      return invalidProviderPermissionRequestPayload();
    }
  }

  if (typeof payload.providerId !== "string") {
    return invalidProviderPermissionRequestPayload();
  }

  const providerId = payload.providerId.trim();
  if (!providerId || providerId.length > 64) {
    return invalidProviderPermissionRequestPayload();
  }

  return { ok: true };
}

function invalidProviderPermissionRequestPayload() {
  return {
    ok: false,
    mode: "permission-request",
    errorCode: "INVALID_PAYLOAD",
    message: "Invalid permission request payload.",
    requestEnabled: false
  };
}

function invalidProviderPermissionStatusPayload() {
  return {
    ok: false,
    mode: "permission-status",
    errorCode: "INVALID_PAYLOAD",
    message: "Invalid permission status payload.",
    requestEnabled: false
  };
}

function invalidRuntimeTestPayload() {
  return {
    ok: false,
    mode: "mock",
    errorCode: "INVALID_PAYLOAD",
    message: "Invalid mock test payload.",
    requestEnabled: false
  };
}

function invalidProviderConnectionTestPayload() {
  return {
    ok: false,
    mode: "real-test",
    errorCode: "INVALID_PAYLOAD",
    message: "Invalid provider test payload.",
    requestEnabled: false
  };
}

function invalidRuntimeChatPayload() {
  return {
    ok: false,
    mode: "background-chat",
    errorCode: "INVALID_PAYLOAD",
    message: "Invalid background chat payload.",
    requestEnabled: false
  };
}

function invalidRuntimeActionPayload() {
  return {
    ok: false,
    source: "Background Runtime",
    mode: "background-action",
    errorCode: "INVALID_PAYLOAD",
    message: "Invalid background runtime action payload.",
    recoveryHint: "Switch Runtime Mode to Local Backend to use the local backend.",
    requestEnabled: false
  };
}

function invalidBackgroundChatReadinessPayload() {
  return {
    ok: false,
    mode: "background-runtime-readiness",
    errorCode: "INVALID_PAYLOAD",
    message: "Invalid background runtime readiness payload.",
    requestEnabled: false
  };
}

export function validateSecretPayload(payload = {}) {
  const allowedKeys = new Set(["apiKey", "secret", "providerId"]);
  const keys = Object.keys(payload || {});
  const unsupportedKey = keys.find((key) => !allowedKeys.has(key));
  if (unsupportedKey) {
    return {
      ok: false,
      error: {
        code: "SECRET_PAYLOAD_FORBIDDEN",
        message: `Runtime secret payload cannot include ${unsupportedKey}.`
      }
    };
  }

  const hasApiKey = typeof payload.apiKey === "string" && payload.apiKey.trim();
  const hasSecret = typeof payload.secret === "string" && payload.secret.trim();
  if ((hasApiKey && hasSecret) || (!hasApiKey && !hasSecret)) {
    return {
      ok: false,
      error: {
        code: "SECRET_PAYLOAD_INVALID",
        message: "Runtime secret payload must include exactly one apiKey or secret."
      }
    };
  }

  return {
    ok: true,
    secret: (payload.apiKey || payload.secret).trim(),
    providerId: typeof payload.providerId === "string" ? payload.providerId.trim().slice(0, 64) : ""
  };
}

export function assertNoArbitraryNetworkAccess(value = {}) {
  const text = JSON.stringify(value);
  if (/https:\/\/\*\/\*|https?:\/\//i.test(text)) {
    return {
      ok: false,
      error: {
        code: "NETWORK_PERMISSION_FORBIDDEN",
        message: "Background runtime does not allow arbitrary URLs or wildcard HTTPS origins."
      }
    };
  }
  return { ok: true };
}
