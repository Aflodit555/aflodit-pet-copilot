import {
  CUSTOM_OPENAI_COMPATIBLE_PROVIDER_ID,
  getDefaultModelForProvider,
  hasProvider,
  normalizeProviderId,
  sanitizeCustomProviderConfig,
  sanitizeModelForProvider
} from "./providerRegistry.js";
import { validatePublicSettings } from "./permissionGuard.js";

const STORAGE_KEY = "afloditBackgroundRuntimePublicSettings";
const USER_DEFAULT_PROVIDER_ID = "dashscope";

const DEFAULT_SETTINGS = Object.freeze({
  provider: USER_DEFAULT_PROVIDER_ID,
  model: getDefaultModelForProvider(USER_DEFAULT_PROVIDER_ID),
  saveMode: "local",
  debugEnabled: false,
  runtimeMode: "background_runtime_beta",
  customProvider: null,
  lastRealTestStatus: null,
  lastActionFailure: null
});

function sanitizeBoolean(value, fallback) {
  return typeof value === "boolean" ? value : fallback;
}

function sanitizeString(value, fallback, maxLength = 120) {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : fallback;
}

function sanitizeOptionalString(value, maxLength = 120) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLength);
}

function sanitizeNullableNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function sanitizeSaveMode(value, fallback) {
  return value === "session" || value === "local" ? value : fallback;
}

function sanitizeRuntimeMode(value, fallback = "local_backend") {
  return value === "background_runtime_beta" || value === "local_backend" ? value : fallback;
}

function sanitizeCustomProvider(value, fallback = null) {
  if (value === null) return null;
  if (value === undefined) return sanitizeCustomProviderConfig(fallback);
  return sanitizeCustomProviderConfig(value);
}

export function sanitizeLastRealTestStatus(value = null) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const providerId = sanitizeString(value.providerId, "", 64);
  const model = sanitizeString(value.model, "", 128);
  const checkedAt = sanitizeString(value.checkedAt, "", 40);
  if (!providerId || typeof value.ok !== "boolean" || !checkedAt) return null;
  const status = {
    providerId,
    model,
    ok: value.ok,
    errorCode: value.ok ? "" : sanitizeString(value.errorCode, "UNKNOWN", 64),
    checkedAt
  };

  if (!value.ok && value.providerError && typeof value.providerError === "object" && !Array.isArray(value.providerError)) {
    status.providerError = {
      providerId: sanitizeOptionalString(value.providerError.providerId, 64),
      model: sanitizeOptionalString(value.providerError.model, 128),
      endpointHost: sanitizeOptionalString(value.providerError.endpointHost, 160),
      httpStatus: sanitizeNullableNumber(value.providerError.httpStatus),
      errorCode: sanitizeOptionalString(value.providerError.errorCode, 80),
      providerErrorCode: sanitizeOptionalString(value.providerError.providerErrorCode, 120),
      providerErrorMessage: sanitizeOptionalString(value.providerError.providerErrorMessage, 500),
      rawErrorBody: sanitizeOptionalString(value.providerError.rawErrorBody, 1200)
    };
  }

  return status;
}

export function sanitizeLastActionFailure(value = null) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const action = sanitizeOptionalString(value.action, 32);
  const providerId = sanitizeOptionalString(value.providerId, 64);
  const model = sanitizeOptionalString(value.model, 128);
  const failedAt = sanitizeOptionalString(value.failedAt, 40);
  if (!action || !providerId || !failedAt) return null;
  return {
    action,
    providerId,
    model,
    timeoutMs: sanitizeNullableNumber(value.timeoutMs),
    errorType: sanitizeOptionalString(value.errorType, 40),
    errorCode: sanitizeOptionalString(value.errorCode, 80),
    httpStatus: sanitizeNullableNumber(value.httpStatus),
    providerErrorCode: sanitizeOptionalString(value.providerErrorCode, 120),
    providerErrorMessage: sanitizeOptionalString(value.providerErrorMessage, 500),
    failedAt
  };
}

export function sanitizePublicSettings(raw = {}, base = DEFAULT_SETTINGS) {
  const provider = sanitizeString(raw.provider, base.provider, 64);
  const safeProvider = hasProvider(provider) ? provider : base.provider;
  const legacyPreviewEnabled = raw.backgroundRuntimePreviewEnabled ?? raw.backgroundChatPreviewEnabled;
  const runtimeMode = raw.runtimeMode !== undefined
    ? sanitizeRuntimeMode(raw.runtimeMode, base.runtimeMode)
    : (legacyPreviewEnabled === true ? "background_runtime_beta" : sanitizeRuntimeMode(base.runtimeMode));

  const customProvider = sanitizeCustomProvider(raw.customProvider, base.customProvider);
  const model = safeProvider === CUSTOM_OPENAI_COMPATIBLE_PROVIDER_ID
    ? sanitizeOptionalString(raw.model ?? base.model, 128)
    : sanitizeModelForProvider(safeProvider, raw.model || base.model);

  return {
    provider: safeProvider,
    model,
    saveMode: sanitizeSaveMode(raw.saveMode, base.saveMode),
    debugEnabled: sanitizeBoolean(raw.debugEnabled, base.debugEnabled),
    runtimeMode,
    customProvider,
    lastRealTestStatus: sanitizeLastRealTestStatus(raw.lastRealTestStatus ?? base.lastRealTestStatus),
    lastActionFailure: sanitizeLastActionFailure(raw.lastActionFailure ?? base.lastActionFailure)
  };
}

export function createSettingsStore(chromeApi) {
  const area = chromeApi?.storage?.local || null;
  let memory = { ...DEFAULT_SETTINGS };

  function getFromStorage() {
    if (!area?.get) return Promise.resolve(memory);
    return new Promise((resolve) => {
      area.get(STORAGE_KEY, (result = {}) => {
        if (chromeApi.runtime?.lastError) {
          resolve(memory);
          return;
        }
        resolve(result[STORAGE_KEY] || memory);
      });
    });
  }

  function setToStorage(value) {
    memory = value;
    if (!area?.set) return Promise.resolve(value);
    return new Promise((resolve) => {
      area.set({ [STORAGE_KEY]: value }, () => {
        resolve(value);
      });
    });
  }

  return {
    async getPublicSettings() {
      const stored = await getFromStorage();
      const settings = sanitizePublicSettings(stored, DEFAULT_SETTINGS);
      memory = settings;
      return { ...settings };
    },

    async savePublicSettings(input = {}) {
      const guard = validatePublicSettings(input);
      if (!guard.ok) return guard;

      const current = await this.getPublicSettings();
      const nextProvider = input.provider !== undefined
        ? normalizeProviderId(input.provider)
        : current.provider;
      const providerChanged = nextProvider !== current.provider;
      const incomingModel = input.model;
      const oldDefaultModel = getDefaultModelForProvider(current.provider);
      const shouldUseDefaultModel = providerChanged
        && nextProvider !== CUSTOM_OPENAI_COMPATIBLE_PROVIDER_ID
        && (incomingModel === undefined || !String(incomingModel).trim() || current.model === oldDefaultModel);
      const nextModel = shouldUseDefaultModel
        ? getDefaultModelForProvider(nextProvider)
        : (incomingModel ?? current.model);
      const nextCustomProvider = input.customProvider !== undefined
        ? sanitizeCustomProvider(input.customProvider, null)
        : current.customProvider;

      if (nextProvider === CUSTOM_OPENAI_COMPATIBLE_PROVIDER_ID && !nextCustomProvider) {
        return {
          ok: false,
          error: {
            code: "CUSTOM_PROVIDER_INVALID",
            message: "Custom OpenAI-compatible provider requires a valid HTTPS Base URL."
          }
        };
      }

      const next = sanitizePublicSettings({
        provider: nextProvider,
        model: nextModel,
        saveMode: input.saveMode ?? current.saveMode,
        debugEnabled: input.debugEnabled ?? current.debugEnabled,
        runtimeMode: input.runtimeMode ?? (input.backgroundRuntimePreviewEnabled === true || input.backgroundChatPreviewEnabled === true
          ? "background_runtime_beta"
          : current.runtimeMode),
        customProvider: nextCustomProvider,
        lastRealTestStatus: current.lastRealTestStatus,
        lastActionFailure: current.lastActionFailure
      }, current);

      await setToStorage(next);
      return { ok: true, settings: { ...next } };
    },

    async saveLastRealTestStatus(status = null) {
      const current = await this.getPublicSettings();
      const next = sanitizePublicSettings({
        ...current,
        lastRealTestStatus: sanitizeLastRealTestStatus(status)
      }, current);
      await setToStorage(next);
      return { ...next.lastRealTestStatus };
    },

    async saveLastActionFailure(failure = null) {
      const current = await this.getPublicSettings();
      const next = sanitizePublicSettings({
        ...current,
        lastActionFailure: sanitizeLastActionFailure(failure)
      }, current);
      await setToStorage(next);
      return next.lastActionFailure ? { ...next.lastActionFailure } : null;
    }
  };
}
