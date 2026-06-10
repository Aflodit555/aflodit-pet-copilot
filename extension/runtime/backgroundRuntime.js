import { validateMessage } from "./messageProtocol.js";
import { assertNoArbitraryNetworkAccess, validateRuntimeTestPayload, validateSecretPayload } from "./permissionGuard.js";
import { createSafeLogger } from "./safeLog.js";
import { createSecretStore } from "./secretStore.js";
import { createSettingsStore } from "./settingsStore.js";
import { getProvider, listPublicProviders, sanitizeModelForProvider } from "./providerRegistry.js";

function publicSettingsResponse(settings, hasApiKey, apiKeyPreview) {
  return {
    ok: true,
    settings: {
      provider: settings.provider,
      model: settings.model,
      saveMode: settings.saveMode,
      debugEnabled: settings.debugEnabled,
      hasApiKey: Boolean(hasApiKey),
      apiKeyPreview: apiKeyPreview || ""
    },
    providers: listPublicProviders()
  };
}

export function createBackgroundRuntime({ chromeApi, version = "0.8.0" } = {}) {
  const settingsStore = createSettingsStore(chromeApi);
  const logger = createSafeLogger({ enabled: false });
  const secretStore = createSecretStore(chromeApi, logger);

  return {
    async handleMessage(message) {
      const parsed = validateMessage(message);
      if (!parsed.ok) return parsed;

      const networkGuard = assertNoArbitraryNetworkAccess(parsed.payload);
      if (!networkGuard.ok) return networkGuard;

      if (parsed.type === "runtime:getStatus") {
        logger.debug("runtime status requested");
        return {
          ok: true,
          runtime: "background",
          version,
          backendlessPhase: 4,
          providerRegistryReady: true,
          providerRequestEnabled: false
        };
      }

      if (parsed.type === "runtime:testConnectionMock") {
        const guard = validateRuntimeTestPayload(parsed.payload || {});
        if (!guard.ok) return guard;

        const providerId = typeof parsed.payload.providerId === "string"
          ? parsed.payload.providerId.trim()
          : "";
        const provider = getProvider(providerId);
        if (!provider) {
          return {
            ok: false,
            mode: "mock",
            errorCode: "UNKNOWN_PROVIDER",
            message: "Unknown provider.",
            requestEnabled: false
          };
        }

        if (!provider.enabled) {
          return {
            ok: false,
            mode: "mock",
            providerId: provider.id,
            errorCode: "PROVIDER_DISABLED",
            message: "Provider is disabled.",
            requestEnabled: false
          };
        }

        const hasApiKey = await secretStore.hasSecret();
        if (!hasApiKey) {
          return {
            ok: false,
            mode: "mock",
            providerId: provider.id,
            errorCode: "MISSING_RUNTIME_KEY",
            message: "Runtime key is missing. Save a Runtime Key before testing.",
            requestEnabled: false
          };
        }

        return {
          ok: true,
          mode: "mock",
          providerId: provider.id,
          providerName: provider.displayName,
          model: sanitizeModelForProvider(provider.id, parsed.payload.model),
          hasApiKey: true,
          requestEnabled: false,
          latencyMs: 0,
          message: "Mock runtime test passed. Real provider requests are still disabled."
        };
      }

      if (parsed.type === "settings:getPublic") {
        const settings = await settingsStore.getPublicSettings();
        return publicSettingsResponse(
          settings,
          await secretStore.hasSecret(),
          await secretStore.getMaskedPreview()
        );
      }

      if (parsed.type === "settings:savePublic") {
        const saved = await settingsStore.savePublicSettings(parsed.payload || {});
        if (!saved.ok) return saved;
        return publicSettingsResponse(
          saved.settings,
          await secretStore.hasSecret(),
          await secretStore.getMaskedPreview()
        );
      }

      if (parsed.type === "settings:saveSecret") {
        const guard = validateSecretPayload(parsed.payload || {});
        if (!guard.ok) return guard;

        const settings = await settingsStore.getPublicSettings();
        const saved = await secretStore.saveSecret(guard.secret, { saveMode: settings.saveMode });
        if (!saved.ok) return saved;

        return publicSettingsResponse(
          settings,
          await secretStore.hasSecret(settings.saveMode),
          await secretStore.getMaskedPreview(settings.saveMode)
        );
      }

      if (parsed.type === "settings:clearKey") {
        const result = await secretStore.clearSecret();
        const settings = await settingsStore.getPublicSettings();
        return {
          ...publicSettingsResponse(settings, false, ""),
          cleared: Boolean(result.cleared)
        };
      }

      return {
        ok: false,
        error: {
          code: "MESSAGE_TYPE_UNHANDLED",
          message: `Runtime message type was validated but not handled: ${parsed.type}`
        }
      };
    }
  };
}
