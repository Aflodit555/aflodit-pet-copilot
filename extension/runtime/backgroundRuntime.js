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
import { getProvider, isRealRuntimeProvider, listPublicProviders } from "./providerRegistry.js";
import {
  runOpenAiCompatibleBackgroundAction,
  runOpenAiCompatibleBackgroundChat,
  testOpenAiCompatibleConnection
} from "./openAiCompatibleRequest.js";

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

function isExactHostPermission(permission = "") {
  return /^https:\/\/[^/*]+\/\*$/.test(permission) && permission !== `https://${"*"}/*`;
}

async function publicSettingsResponse(settings, secretStore) {
  const providerId = settings.provider;
  const providers = await Promise.all(listPublicProviders().map(async (provider) => ({
    ...provider,
    hasApiKey: Boolean(await secretStore.hasSecret(settings.saveMode, provider.id)),
    apiKeyPreview: await secretStore.getMaskedPreview(settings.saveMode, provider.id)
  })));
  return {
    ok: true,
    settings: {
      provider: providerId,
      model: settings.model,
      saveMode: settings.saveMode,
      debugEnabled: settings.debugEnabled,
      runtimeMode: settings.runtimeMode,
      lastRealTestStatus: settings.lastRealTestStatus || null,
      hasApiKey: Boolean(await secretStore.hasSecret(settings.saveMode, providerId)),
      apiKeyPreview: await secretStore.getMaskedPreview(settings.saveMode, providerId)
    },
    providers
  };
}

function readinessCheck(id, label, ok, message) {
  return { id, label, ok: Boolean(ok), message };
}

function firstMissingCheck(checks = []) {
  return checks.find((check) => !check.ok) || null;
}

function safeRealTestStatus({ providerId = "", model = "", ok = false, errorCode = "" } = {}) {
  return {
    providerId: String(providerId || "").trim().slice(0, 64),
    model: String(model || "").trim().slice(0, 128),
    ok: Boolean(ok),
    errorCode: ok ? "" : String(errorCode || "UNKNOWN").trim().slice(0, 64),
    checkedAt: new Date().toISOString()
  };
}

function selectedModelFor(provider, model, settings) {
  return (typeof model === "string" ? model.trim() : "")
    || settings?.model
    || provider?.defaultModel
    || "";
}

function permissionNotConfiguredResponse(mode, provider) {
  return {
    ok: false,
    mode,
    providerId: provider?.id || "",
    providerName: provider?.displayName || "",
    errorCode: "PERMISSION_NOT_CONFIGURED",
    message: "Provider permission is not configured for Backendless Beta.",
    requestEnabled: false
  };
}

function providerNotRuntimeCapable(provider) {
  return !provider || !provider.enabled || !isRealRuntimeProvider(provider);
}

function runtimeCapabilityMessage(provider) {
  if (!provider) return "Provider is not registered.";
  if (!provider.enabled) return "Provider is disabled.";
  if (!isRealRuntimeProvider(provider)) return "Select DeepSeek, Alibaba Bailian / DashScope, OpenAI, or OpenRouter.";
  return `${provider.displayName} is selected.`;
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
            runtimeMode: "local_backend",
            canUseBackgroundRuntime: false,
            requestEnabled: false,
            checks: [
              readinessCheck("provider", "Provider", false, "Provider is not registered.")
            ],
            nextAction: "Choose a supported real provider in Runtime Setup."
          };
        }

        const settings = await settingsStore.getPublicSettings();
        const selectedModel = selectedModelFor(provider, parsed.payload.model, settings);
        const providerReady = !providerNotRuntimeCapable(provider);
        const permissionConfigured = providerReady && isExactHostPermission(provider.requiredHostPermission);
        const permissionGranted = permissionConfigured
          ? await containsPermission(chromeApi, provider.requiredHostPermission)
          : false;
        const hasApiKey = providerReady
          ? await secretStore.hasSecret(settings.saveMode, provider.id)
          : false;
        const checks = [
          readinessCheck(
            "provider",
            "Provider",
            providerReady,
            runtimeCapabilityMessage(provider)
          ),
          readinessCheck(
            "runtimeKey",
            "Runtime Key",
            hasApiKey,
            hasApiKey ? `Runtime Key saved for ${provider.displayName}.` : `Save a Runtime Key for ${provider.displayName} in Runtime Setup.`
          ),
          readinessCheck(
            "permission",
            "Permission",
            permissionConfigured && permissionGranted,
            !permissionConfigured
              ? "Provider permission is not configured for Backendless Beta."
              : permissionGranted
                ? `${provider.displayName} permission granted.`
                : `Grant ${provider.displayName} permission in Runtime Setup.`
          ),
          readinessCheck(
            "model",
            "Model",
            Boolean(selectedModel.trim()),
            selectedModel.trim() ? "Model is ready." : "Enter a model name."
          ),
          readinessCheck(
            "runtimeMode",
            "Runtime Mode",
            true,
            settings.runtimeMode === "background_runtime_beta"
              ? "Background Runtime Beta is selected."
              : "Local Backend Dev mode is selected."
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
          runtimeMode: settings.runtimeMode,
          canUseBackgroundRuntime: !blocker,
          checks,
          requestEnabled: false,
          nextAction: blocker ? blocker.message : "Background Runtime Beta is ready."
        };
      }

      if (parsed.type === MESSAGE_TYPES.runtimeGetDiagnostics) {
        const settings = await settingsStore.getPublicSettings();
        const provider = getProvider(settings.provider);
        const permissionConfigured = Boolean(provider) && isRealRuntimeProvider(provider) && isExactHostPermission(provider.requiredHostPermission);
        const permissionGranted = permissionConfigured
          ? await containsPermission(chromeApi, provider.requiredHostPermission)
          : false;
        const hasApiKey = provider
          ? await secretStore.hasSecret(settings.saveMode, provider.id)
          : false;
        const model = settings.model || provider?.defaultModel || "";
        const providerReady = Boolean(provider) && !providerNotRuntimeCapable(provider);
        const readinessReady = providerReady && Boolean(model.trim()) && hasApiKey && permissionConfigured && permissionGranted;

        return {
          ok: true,
          mode: "diagnostics",
          diagnostics: {
            version,
            runtimeMode: settings.runtimeMode,
            providerId: provider?.id || settings.provider,
            providerName: provider?.displayName || settings.provider,
            model,
            releaseChannel: "backendless-beta",
            hasRuntimeKey: Boolean(hasApiKey),
            apiKeyPreview: provider ? await secretStore.getMaskedPreview(settings.saveMode, provider.id) : "",
            permissionStatus: !permissionConfigured ? "not_configured" : (permissionGranted ? "granted" : "missing"),
            readinessStatus: readinessReady ? "ready" : "blocked",
            lastRealTestStatus: settings.lastRealTestStatus || null,
            requestEnabled: false,
            sourceLabelSupport: true
          }
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

        if (!isRealRuntimeProvider(provider) || !isExactHostPermission(provider.requiredHostPermission)) {
          return permissionNotConfiguredResponse("permission-status", provider);
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
            ? `${provider.displayName} permission is granted.`
            : `${provider.displayName} permission is not granted yet.`
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

        if (!isRealRuntimeProvider(provider) || !isExactHostPermission(provider.requiredHostPermission)) {
          return permissionNotConfiguredResponse("permission-request", provider);
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
            message: `${provider.displayName} permission was not granted.`
          };
        }

        return {
          ok: true,
          mode: "permission-request",
          providerId: provider.id,
          providerName: provider.displayName,
          permissionGranted: true,
          requestEnabled: false,
          message: `${provider.displayName} permission granted.`
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
            ? "Switch Runtime Mode to Local Backend or use /local to use the local backend."
            : "Switch Runtime Mode to Local Backend to use the local backend.",
          requestEnabled: false,
          ...extra
        });

        if (!provider) return failure("UNKNOWN_PROVIDER", "Unknown provider.");
        if (!provider.enabled) return failure("PROVIDER_DISABLED", "Provider is disabled.");
        if (!isRealRuntimeProvider(provider)) {
          return failure("BACKGROUND_ACTION_NOT_CONFIGURED", "Background Runtime actions require DeepSeek, Alibaba Bailian / DashScope, OpenAI, or OpenRouter.");
        }
        if (!isExactHostPermission(provider.requiredHostPermission)) {
          return failure("PERMISSION_NOT_CONFIGURED", "Provider permission is not configured for Backendless Beta.");
        }

        const permissionGranted = await containsPermission(chromeApi, provider.requiredHostPermission);
        if (!permissionGranted) {
          return failure("MISSING_PROVIDER_PERMISSION", `${provider.displayName} permission is missing. Grant provider permission before running background runtime actions.`);
        }

        const settings = await settingsStore.getPublicSettings();
        const hasApiKey = await secretStore.hasSecret(settings.saveMode, provider.id);
        if (!hasApiKey) {
          return failure("MISSING_RUNTIME_KEY", `Runtime key is missing. Save a Runtime Key for ${provider.displayName} before running background runtime actions.`);
        }

        return runOpenAiCompatibleBackgroundAction({
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

        if (!isRealRuntimeProvider(provider)) {
          return {
            ok: false,
            mode: "background-chat",
            providerId: provider.id,
            errorCode: "BACKGROUND_CHAT_NOT_CONFIGURED",
            message: "Background chat requires DeepSeek, Alibaba Bailian / DashScope, OpenAI, or OpenRouter.",
            requestEnabled: false
          };
        }

        if (!isExactHostPermission(provider.requiredHostPermission)) {
          return permissionNotConfiguredResponse("background-chat", provider);
        }

        const permissionGranted = await containsPermission(chromeApi, provider.requiredHostPermission);
        if (!permissionGranted) {
          return {
            ok: false,
            mode: "background-chat",
            providerId: provider.id,
            providerName: provider.displayName,
            errorCode: "MISSING_PROVIDER_PERMISSION",
            message: `${provider.displayName} permission is missing. Grant provider permission before running background chat.`,
            requestEnabled: false
          };
        }

        const settings = await settingsStore.getPublicSettings();
        const hasApiKey = await secretStore.hasSecret(settings.saveMode, provider.id);
        if (!hasApiKey) {
          return {
            ok: false,
            mode: "background-chat",
            providerId: provider.id,
            providerName: provider.displayName,
            errorCode: "MISSING_RUNTIME_KEY",
            message: `Runtime key is missing. Save a Runtime Key for ${provider.displayName} before running background chat.`,
            requestEnabled: false
          };
        }

        return runOpenAiCompatibleBackgroundChat({
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
          const status = await settingsStore.saveLastRealTestStatus(safeRealTestStatus({
            providerId,
            model: typeof parsed.payload.model === "string" ? parsed.payload.model.trim() : "",
            ok: false,
            errorCode: "UNKNOWN_PROVIDER"
          }));
          return {
            ok: false,
            mode: "real-test",
            errorCode: "UNKNOWN_PROVIDER",
            message: "Unknown provider.",
            requestEnabled: false,
            lastRealTestStatus: status
          };
        }

        const saveStatus = async (errorCode, ok = false, model = parsed.payload.model || provider.defaultModel) => settingsStore.saveLastRealTestStatus(safeRealTestStatus({
          providerId: provider.id,
          model,
          ok,
          errorCode
        }));

        if (!provider.enabled) {
          return {
            ok: false,
            mode: "real-test",
            providerId: provider.id,
            errorCode: "PROVIDER_DISABLED",
            message: "Provider is disabled.",
            requestEnabled: false,
            lastRealTestStatus: await saveStatus("PROVIDER_DISABLED")
          };
        }

        if (!isRealRuntimeProvider(provider)) {
          return {
            ok: false,
            mode: "real-test",
            providerId: provider.id,
            errorCode: "REAL_TEST_NOT_CONFIGURED",
            message: "Real provider test requires DeepSeek, Alibaba Bailian / DashScope, OpenAI, or OpenRouter.",
            requestEnabled: false,
            lastRealTestStatus: await saveStatus("REAL_TEST_NOT_CONFIGURED")
          };
        }

        if (!isExactHostPermission(provider.requiredHostPermission)) {
          return {
            ...permissionNotConfiguredResponse("real-test", provider),
            lastRealTestStatus: await saveStatus("PERMISSION_NOT_CONFIGURED")
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
            message: `${provider.displayName} permission is missing. Grant provider permission before running a real test.`,
            requestEnabled: false,
            lastRealTestStatus: await saveStatus("MISSING_PROVIDER_PERMISSION")
          };
        }

        const settings = await settingsStore.getPublicSettings();
        const hasApiKey = await secretStore.hasSecret(settings.saveMode, provider.id);
        if (!hasApiKey) {
          return {
            ok: false,
            mode: "real-test",
            providerId: provider.id,
            providerName: provider.displayName,
            errorCode: "MISSING_RUNTIME_KEY",
            message: `Runtime key is missing. Save a Runtime Key for ${provider.displayName} before running a real test.`,
            requestEnabled: false,
            lastRealTestStatus: await saveStatus("MISSING_RUNTIME_KEY")
          };
        }

        const response = await testOpenAiCompatibleConnection({
          provider,
          model: parsed.payload.model,
          secretStore,
          saveMode: settings.saveMode,
          logger
        });
        const status = await settingsStore.saveLastRealTestStatus(safeRealTestStatus({
          providerId: provider.id,
          model: response.model || parsed.payload.model || provider.defaultModel,
          ok: Boolean(response.ok),
          errorCode: response.errorCode || ""
        }));
        return {
          ...response,
          lastRealTestStatus: status
        };
      }

      const networkGuard = assertNoArbitraryNetworkAccess(parsed.payload);
      if (!networkGuard.ok) return networkGuard;

      if (parsed.type === MESSAGE_TYPES.runtimeGetStatus) {
        logger.debug("runtime status requested");
        return {
          ok: true,
          runtime: "background",
          version,
          backendlessPhase: 12,
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

        const settings = await settingsStore.getPublicSettings();
        const hasApiKey = await secretStore.hasSecret(settings.saveMode, provider.id);
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
        return publicSettingsResponse(settings, secretStore);
      }

      if (parsed.type === MESSAGE_TYPES.settingsSavePublic) {
        const saved = await settingsStore.savePublicSettings(parsed.payload || {});
        if (!saved.ok) return saved;
        return publicSettingsResponse(saved.settings, secretStore);
      }

      if (parsed.type === MESSAGE_TYPES.settingsSaveSecret) {
        const guard = validateSecretPayload(parsed.payload || {});
        if (!guard.ok) return guard;

        const settings = await settingsStore.getPublicSettings();
        const providerId = guard.providerId || settings.provider;
        const provider = getProvider(providerId);
        if (!provider) {
          return {
            ok: false,
            error: {
              code: "UNKNOWN_PROVIDER",
              message: "Runtime key provider is not registered."
            }
          };
        }

        const saved = await secretStore.saveSecret(guard.secret, { saveMode: settings.saveMode, providerId: provider.id });
        if (!saved.ok) return saved;

        return publicSettingsResponse({ ...settings, provider: provider.id }, secretStore);
      }

      if (parsed.type === MESSAGE_TYPES.settingsClearKey) {
        const settings = await settingsStore.getPublicSettings();
        const result = await secretStore.clearSecret({ providerId: settings.provider });
        return {
          ...await publicSettingsResponse(settings, secretStore),
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
