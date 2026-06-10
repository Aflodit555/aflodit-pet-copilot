import { hasProvider } from "./providerRegistry.js";

export function validatePublicSettings(settings = {}) {
  if (settings.provider !== undefined && !hasProvider(settings.provider)) {
    return {
      ok: false,
      error: {
        code: "PROVIDER_NOT_ALLOWED",
        message: `Provider is not registered for background runtime: ${settings.provider}`
      }
    };
  }

  const allowedKeys = new Set(["provider", "model", "saveMode", "debugEnabled"]);
  const forbiddenKeys = new Set(["apiKey", "baseUrl", "url", "endpoint", "headers", "rawBody", "authorization", "Authorization"]);

  for (const key of Object.keys(settings || {})) {
    if (forbiddenKeys.has(key)) {
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

  for (const key of ["baseUrl", "url", "endpoint", "headers", "apiKey", "rawBody", "Authorization"]) {
    if (settings[key] !== undefined) {
      return {
        ok: false,
        error: {
          code: "SETTING_FORBIDDEN",
          message: `Public background settings cannot include ${key}.`
        }
      };
    }
  }

  return { ok: true };
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
