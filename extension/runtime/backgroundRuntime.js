import { validateMessage } from "./messageProtocol.js";
import { assertNoArbitraryNetworkAccess } from "./permissionGuard.js";
import { createSafeLogger } from "./safeLog.js";
import { createSecretStore } from "./secretStore.js";
import { createSettingsStore } from "./settingsStore.js";

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
    }
  };
}

export function createBackgroundRuntime({ chromeApi, version = "0.8.0" } = {}) {
  const settingsStore = createSettingsStore(chromeApi);
  const secretStore = createSecretStore();
  const logger = createSafeLogger({ enabled: false });

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
          backendlessPhase: 2
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
