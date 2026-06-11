import { hasProvider } from "./providerRegistry.js";

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
  "authorization",
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
  const allowedKeys = new Set(["provider", "model", "saveMode", "debugEnabled"]);

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

export function validateSecretPayload(payload = {}) {
  const allowedKeys = new Set(["apiKey", "secret"]);
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
    secret: (payload.apiKey || payload.secret).trim()
  };
}

export function assertNoArbitraryNetworkAccess(value = {}) {
  const text = JSON.stringify(value);
  if (/https:\/\/\*\/\*|https?:\/\//i.test(text)) {
    return {
      ok: false,
      error: {
        code: "NETWORK_PERMISSION_FORBIDDEN",
        message: "Background runtime does not allow arbitrary URLs or https://*/* in Phase 1."
      }
    };
  }
  return { ok: true };
}
