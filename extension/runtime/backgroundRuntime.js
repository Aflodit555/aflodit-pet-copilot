import { MESSAGE_TYPES, validateMessage } from "./messageProtocol.js";
import {
  assertNoArbitraryNetworkAccess,
  validateBackgroundChatReadinessPayload,
  validateProviderConnectionTestPayload,
  validateProviderPermissionRequestPayload,
  validateProviderPermissionStatusPayload,
  validateRuntimeActionPayload,
  validateRuntimeChatPayload,
  validateRuntimeTestPayload,
  validateSecretPayload
} from "./permissionGuard.js";
import { createSafeLogger } from "./safeLog.js";
import { createSecretStore } from "./secretStore.js";
import { createSettingsStore } from "./settingsStore.js";
import { getProvider, listPublicProviders } from "./providerRegistry.js";
import { requiredDeepSeekHostPermission, runDeepSeekBackgroundAction, runDeepSeekBackgroundChat, testDeepSeekRealConnection } from "./deepseekTestConnection.js";

const DEEPSEEK_PROVIDER_ID = "deepseek";
const DEEPSEEK_REQUIRED_HOST_PERMISSION = "https://api.deepseek.com/*";

function containsPermission(chromeApi, requiredHostPermission) {
  if (!chromeApi?.permissions?.contains || !requiredHostPermission) {
    return Promise.resolve(false);
  }

  return new Promise((resolve) => {
    try {
      chromeApi.permissions.contains({ origins: [requiredHostPermission] }, (granted) => {
        if (chromeApi.runtime?.lastError) {
          resolve(false);
          return;
        }
        resolve(Boolean(granted));
      });
    } catch (error) {
      resolve(false);
    }
  });
}

function requestPermission(chrome, requiredHostPermission) {
  if (!chrome?.permissions?.request || !requiredHostPermission) {
    return Promise.resolve(false);
  }

  return new Promise((resolve) => {
    try {
      chrome.permissions.request({ origins: [requiredHostPermission] }, (granted) => {
        if (chrome.runtime?.lastError) {
          resolve(false);
          return;
        }
        resolve(Boolean(granted));
      });
    } catch (error) {
      resolve(false);
    }
  });
}

function publicSettingsResponse(settings, hasApiKey, apiKeyPreview) {
  return {
    ok: true,
    settings: {
      provider: settings.provider,
      model: settings.model,
      saveMode: settings.saveMode,
      debugEnabled: settings.debugEnabled,
      backgroundRuntimePreviewEnabled: Boolean(settings.backgroundRuntimePreviewEnabled),
      hasApiKey: Boolean(hasApiKey),
      apiKeyPreview: apiKeyPreview || ""
    },
    providers: listPublicProviders()
  };
}

function readinessCheck(id, label, ok, message) {
  return { id, label, ok: Boolean(ok), message };
}

function firstMissingCheck(checks = []) {
  return checks.find((check) => !check.ok) || null;
}

export function createBackgroundRuntime({ chromeApi, version = "0.8.0" } = {}) {
  const settingsStore = createSettingsStore(chromeApi);
  const logger = createSafeLogger({ enabled: false });
  const secretStore = createSecretStore(chromeApi, logger);

  return {
    async handleMessage(message) {
      const parsed = validateMessage(message);
      if (!parsed.ok) return parsed;

      if (parsed.type === MESSAGE_TYPES.runtimeGetBackgroundChatReadiness) {
        const guard = validateBackgroundChatReadinessPayload(parsed.payload || {});
        if (!guard.ok) return guard;

        const providerId = parsed.payload.providerId.trim();
        const provider = getProvider(providerId);
        if (!provider) {
          return {
            ok: false,
          mode: "background-runtime-readiness",
          providerId,
          errorCode: "UNKNOWN_PROVIDER",
          message: "Unknown provider.",
          canUseBackgroundRuntimePreview: false,
          requestEnabled: false,
            checks: [
              readinessCheck("provider", "Provider", false, "Provider is not registered.")
            ],
            nextAction: "Choose DeepSeek in Backendless Preview."
          };
        }

        const settings = await settingsStore.getPublicSettings();
        const selectedModel = (typeof parsed.payload.model === "string" ? parsed.payload.model.trim() : "")
          || settings.model
          || provider.defaultModel
          || "";
        const providerReady = Boolean(provider.enabled) && provider.id === DEEPSEEK_PROVIDER_ID;
        const permissionConfigured = provider.requiredHostPermission === requiredDeepSeekHostPermission();
        const permissionGranted = permissionConfigured
          ? await containsPermission(chromeApi, provider.requiredHostPermission)
          : false;
        const hasApiKey = await secretStore.hasSecret(settings.saveMode);
        const checks = [
          readinessCheck(
            "provider",
            "Provider",
            providerReady,
            !provider.enabled
              ? "Provider is disabled."
              : provider.id === DEEPSEEK_PROVIDER_ID
                ? "DeepSeek is selected."
                : "Background Runtime Preview currently supports DeepSeek only."
          ),
          readinessCheck(
            "runtimeKey",
            "Runtime Key",
            hasApiKey,
            hasApiKey ? "Runtime Key saved." : "Save a Runtime Key in Backendless Preview."
          ),
          readinessCheck(
            "permission",
            "Permission",
            permissionConfigured && permissionGranted,
            !permissionConfigured
              ? "DeepSeek permission is not configured for this provider."
              : permissionGranted
                ? "DeepSeek permission granted."
                : "Grant DeepSeek permission in Backendless Preview."
          ),
          readinessCheck(
            "model",
            "Model",
            Boolean(selectedModel.trim()),
            selectedModel.trim() ? "Model is ready." : "Enter a model name."
          ),
          readinessCheck(
            "preview",
            "Preview",
            true,
            settings.backgroundRuntimePreviewEnabled
              ? "Background Runtime Preview is on."
              : "Background Runtime Preview is off."
          ),
          readinessCheck(
            "realTest",
            "Real Test",
            true,
            "Real Test: optional / not checked."
          )
        ];
        const blocker = firstMissingCheck(checks);

        return {
          ok: true,
          mode: "background-runtime-readiness",
          providerId: provider.id,
          providerName: provider.displayName,
          model: selectedModel.trim(),
          backgroundRuntimePreviewEnabled: Boolean(settings.backgroundRuntimePreviewEnabled),
          canUseBackgroundRuntimePreview: !blocker,
          checks,
          requestEnabled: false,
          nextAction: blocker ? blocker.message : "Background Runtime Preview is ready."
        };
      }

      if (parsed.type === MESSAGE_TYPES.runtimeGetProviderPermissionStatus) {
        const guard = validateProviderPermissionStatusPayload(parsed.payload || {});
        if (!guard.ok) return guard;

        const providerId = parsed.payload.providerId.trim();
        const provider = getProvider(providerId);
        if (!provider) {
          return {
            ok: false,
            mode: "permission-status",
            providerId,
            errorCode: "UNKNOWN_PROVIDER",
            message: "Unknown provider.",
            requestEnabled: false
          };
        }

        if (!provider.requiredHostPermission) {
          return {
            ok: false,
            mode: "permission-status",
            providerId: provider.id,
            errorCode: "PERMISSION_NOT_CONFIGURED",
            message: "Provider permission is not configured in this preview phase.",
            requestEnabled: false
          };
        }

        const permissionGranted = await containsPermission(chromeApi, provider.requiredHostPermission);
        return {
          ok: true,
          providerId: provider.id,
          providerName: provider.displayName,
          mode: "permission-status",
          permissionConfigured: true,
          permissionGranted,
          requestEnabled: false,
          message: permissionGranted
            ? "Provider permission is granted. Real provider requests are still disabled."
            : "Provider permission is not granted yet. Real provider requests are still disabled."
        };
      }

      if (parsed.type === MESSAGE_TYPES.runtimeRequestProviderPermission) {
        const guard = validateProviderPermissionRequestPayload(parsed.payload || {});
        if (!guard.ok) return guard;

        const providerId = parsed.payload.providerId.trim();
        const provider = getProvider(providerId);
        if (!provider) {
          return {
            ok: false,
            mode: "permission-request",
            errorCode: "UNKNOWN_PROVIDER",
            message: "Unknown provider.",
            requestEnabled: false
          };
        }

        if (
          provider.id !== DEEPSEEK_PROVIDER_ID
          || provider.requiredHostPermission !== DEEPSEEK_REQUIRED_HOST_PERMISSION
        ) {
          return {
            ok: false,
            mode: "permission-request",
            providerId: provider.id,
            errorCode: "PERMISSION_NOT_CONFIGURED",
            message: "Provider permission request is not configured in this preview phase.",
            requestEnabled: false
          };
        }

        const permissionGranted = await requestPermission(chromeApi, provider.requiredHostPermission);
        if (!permissionGranted) {
          return {
            ok: false,
            mode: "permission-request",
            providerId: provider.id,
            providerName: provider.displayName,
            errorCode: "PERMISSION_DENIED",
            permissionGranted: false,
            requestEnabled: false,
            message: "DeepSeek permission was not granted. Real provider requests are still disabled."
          };
        }

        return {
          ok: true,
          mode: "permission-request",
          providerId: provider.id,
          providerName: provider.displayName,
          permissionGranted: true,
          requestEnabled: false,
          message: "DeepSeek permission granted. Real provider requests are still disabled."
        };
      }

      if (parsed.type === MESSAGE_TYPES.runtimeAction) {
        const guard = validateRuntimeActionPayload(parsed.payload || {});
        if (!guard.ok) return guard;

        const providerId = parsed.payload.providerId.trim();
        const model = typeof parsed.payload.model === "string" ? parsed.payload.model.trim() : "";
        const action = parsed.payload.action;
        const userText = parsed.payload.userText.trim();
        const pageText = typeof parsed.payload.pageText === "string" ? parsed.payload.pageText.trim() : "";
        const selectionText = typeof parsed.payload.selectionText === "string" ? parsed.payload.selectionText.trim() : "";
        const provider = getProvider(providerId);
        const failure = (errorCode, message, extra = {}) => ({
          ok: false,
          source: "Background Runtime",
          mode: "background-action",
          action,
          providerId: provider?.id || providerId,
          providerName: provider?.displayName,
          errorCode,
          message,
          recoveryHint: action === "chat"
            ? "Disable Background Runtime Preview or use /local to use Local Backend."
            : "Disable Background Runtime Preview to use Local Backend.",
          requestEnabled: false,
          ...extra
        });

        if (!provider) {
          return failure("UNKNOWN_PROVIDER", "Unknown provider.");
        }

        if (!provider.enabled) {
          return failure("PROVIDER_DISABLED", "Provider is disabled.");
        }

        if (provider.id !== DEEPSEEK_PROVIDER_ID) {
          return failure("BACKGROUND_ACTION_NOT_CONFIGURED", "Background Runtime actions are only configured for DeepSeek in this preview phase.");
        }

        if (provider.requiredHostPermission !== requiredDeepSeekHostPermission()) {
          return failure("PERMISSION_NOT_CONFIGURED", "DeepSeek permission is not configured in this preview phase.");
        }

        const permissionGranted = await containsPermission(chromeApi, provider.requiredHostPermission);
        if (!permissionGranted) {
          return failure("MISSING_PROVIDER_PERMISSION", "DeepSeek permission is missing. Grant provider permission before running background runtime actions.");
        }

        const settings = await settingsStore.getPublicSettings();
        const hasApiKey = await secretStore.hasSecret(settings.saveMode);
        if (!hasApiKey) {
          return failure("MISSING_RUNTIME_KEY", "Runtime key is missing. Save a Runtime Key before running background runtime actions.");
        }

        return runDeepSeekBackgroundAction({
          provider,
          model,
          action,
          userText,
          pageText,
          selectionText,
          secretStore,
          saveMode: settings.saveMode,
          logger
        });
      }

      if (parsed.type === MESSAGE_TYPES.runtimeChat) {
        const guard = validateRuntimeChatPayload(parsed.payload || {});
        if (!guard.ok) return guard;

        const providerId = parsed.payload.providerId.trim();
        const model = typeof parsed.payload.model === "string" ? parsed.payload.model.trim() : "";
        const userText = parsed.payload.userText.trim();
        const provider = getProvider(providerId);
        if (!provider) {
          return {
            ok: false,
            mode: "background-chat",
            errorCode: "UNKNOWN_PROVIDER",
            message: "Unknown provider.",
            requestEnabled: false
          };
        }

        if (!provider.enabled) {
          return {
            ok: false,
            mode: "background-chat",
            providerId: provider.id,
            errorCode: "PROVIDER_DISABLED",
            message: "Provider is disabled.",
            requestEnabled: false
          };
        }

        if (provider.id !== DEEPSEEK_PROVIDER_ID) {
          return {
            ok: false,
            mode: "background-chat",
            providerId: provider.id,
            errorCode: "BACKGROUND_CHAT_NOT_CONFIGURED",
            message: "Background chat is only configured for DeepSeek in this preview phase.",
            requestEnabled: false
          };
        }

        if (provider.requiredHostPermission !== requiredDeepSeekHostPermission()) {
          return {
            ok: false,
            mode: "background-chat",
            providerId: provider.id,
            providerName: provider.displayName,
            errorCode: "PERMISSION_NOT_CONFIGURED",
            message: "DeepSeek permission is not configured in this preview phase.",
            requestEnabled: false
          };
        }

        const permissionGranted = await containsPermission(chromeApi, provider.requiredHostPermission);
        if (!permissionGranted) {
          return {
            ok: false,
            mode: "background-chat",
            providerId: provider.id,
            providerName: provider.displayName,
            errorCode: "MISSING_PROVIDER_PERMISSION",
            message: "DeepSeek permission is missing. Grant provider permission before running background chat.",
            requestEnabled: false
          };
        }

        const settings = await settingsStore.getPublicSettings();
        const hasApiKey = await secretStore.hasSecret(settings.saveMode);
        if (!hasApiKey) {
          return {
            ok: false,
            mode: "background-chat",
            providerId: provider.id,
            providerName: provider.displayName,
            errorCode: "MISSING_RUNTIME_KEY",
            message: "Runtime key is missing. Save a Runtime Key before running background chat.",
            requestEnabled: false
          };
        }

        return runDeepSeekBackgroundChat({
          provider,
          model,
          userText,
          secretStore,
          saveMode: settings.saveMode,
          logger
        });
      }

      if (parsed.type === MESSAGE_TYPES.runtimeTestProviderConnection) {
        const guard = validateProviderConnectionTestPayload(parsed.payload || {});
        if (!guard.ok) return guard;

        const providerId = parsed.payload.providerId.trim();
        const provider = getProvider(providerId);
        if (!provider) {
          return {
            ok: false,
            mode: "real-test",
            errorCode: "UNKNOWN_PROVIDER",
            message: "Unknown provider.",
            requestEnabled: false
          };
        }

        if (!provider.enabled) {
          return {
            ok: false,
            mode: "real-test",
            providerId: provider.id,
            errorCode: "PROVIDER_DISABLED",
            message: "Provider is disabled.",
            requestEnabled: false
          };
        }

        if (provider.id !== DEEPSEEK_PROVIDER_ID) {
          return {
            ok: false,
            mode: "real-test",
            providerId: provider.id,
            errorCode: "REAL_TEST_NOT_CONFIGURED",
            message: "Real provider test is only configured for DeepSeek in this preview phase.",
            requestEnabled: false
          };
        }

        if (provider.requiredHostPermission !== requiredDeepSeekHostPermission()) {
          return {
            ok: false,
            mode: "real-test",
            providerId: provider.id,
            providerName: provider.displayName,
            errorCode: "PERMISSION_NOT_CONFIGURED",
            message: "DeepSeek permission is not configured in this preview phase.",
            requestEnabled: false
          };
        }

        const permissionGranted = await containsPermission(chromeApi, provider.requiredHostPermission);
        if (!permissionGranted) {
          return {
            ok: false,
            mode: "real-test",
            providerId: provider.id,
            providerName: provider.displayName,
            errorCode: "MISSING_PROVIDER_PERMISSION",
            message: "DeepSeek permission is missing. Grant provider permission before running a real test.",
            requestEnabled: false
          };
        }

        const settings = await settingsStore.getPublicSettings();
        const hasApiKey = await secretStore.hasSecret(settings.saveMode);
        if (!hasApiKey) {
          return {
            ok: false,
            mode: "real-test",
            providerId: provider.id,
            providerName: provider.displayName,
            errorCode: "MISSING_RUNTIME_KEY",
            message: "Runtime key is missing. Save a Runtime Key before running a real test.",
            requestEnabled: false
          };
        }

        return testDeepSeekRealConnection({
          provider,
          model: parsed.payload.model,
          secretStore,
          saveMode: settings.saveMode,
          logger
        });
      }

      const networkGuard = assertNoArbitraryNetworkAccess(parsed.payload);
      if (!networkGuard.ok) return networkGuard;

      if (parsed.type === MESSAGE_TYPES.runtimeGetStatus) {
        logger.debug("runtime status requested");
        return {
          ok: true,
          runtime: "background",
          version,
          backendlessPhase: 6,
          providerRegistryReady: true,
          providerRequestEnabled: false
        };
      }

      if (parsed.type === MESSAGE_TYPES.runtimeTestConnectionMock) {
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
          model: parsed.payload.model.trim() || provider.defaultModel,
          hasApiKey: true,
          requestEnabled: false,
          latencyMs: 0,
          message: "Mock runtime test passed. Real provider requests are still disabled."
        };
      }

      if (parsed.type === MESSAGE_TYPES.settingsGetPublic) {
        const settings = await settingsStore.getPublicSettings();
        return publicSettingsResponse(
          settings,
          await secretStore.hasSecret(),
          await secretStore.getMaskedPreview()
        );
      }

      if (parsed.type === MESSAGE_TYPES.settingsSavePublic) {
        const saved = await settingsStore.savePublicSettings(parsed.payload || {});
        if (!saved.ok) return saved;
        return publicSettingsResponse(
          saved.settings,
          await secretStore.hasSecret(),
          await secretStore.getMaskedPreview()
        );
      }

      if (parsed.type === MESSAGE_TYPES.settingsSaveSecret) {
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

      if (parsed.type === MESSAGE_TYPES.settingsClearKey) {
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
