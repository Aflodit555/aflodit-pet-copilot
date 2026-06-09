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

  for (const key of ["baseUrl", "url", "endpoint", "headers", "apiKey"]) {
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
