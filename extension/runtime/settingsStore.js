import {
  getDefaultModelForProvider,
  getDefaultProviderId,
  hasProvider,
  normalizeProviderId,
  sanitizeModelForProvider
} from "./providerRegistry.js";
import { validatePublicSettings } from "./permissionGuard.js";

const STORAGE_KEY = "afloditBackgroundRuntimePublicSettings";

const DEFAULT_SETTINGS = Object.freeze({
  provider: getDefaultProviderId(),
  model: getDefaultModelForProvider(getDefaultProviderId()),
  saveMode: "local",
  debugEnabled: false,
  runtimeMode: "local_backend"
});

function sanitizeBoolean(value, fallback) {
  return typeof value === "boolean" ? value : fallback;
}

function sanitizeString(value, fallback, maxLength = 120) {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : fallback;
}

function sanitizeSaveMode(value, fallback) {
  return value === "session" || value === "local" ? value : fallback;
}

function sanitizeRuntimeMode(value, fallback = "local_backend") {
  return value === "background_runtime_beta" || value === "local_backend" ? value : fallback;
}

export function sanitizePublicSettings(raw = {}, base = DEFAULT_SETTINGS) {
  const provider = sanitizeString(raw.provider, base.provider, 64);
  const safeProvider = hasProvider(provider) ? provider : base.provider;
  const legacyPreviewEnabled = raw.backgroundRuntimePreviewEnabled ?? raw.backgroundChatPreviewEnabled;
  const runtimeMode = raw.runtimeMode !== undefined
    ? sanitizeRuntimeMode(raw.runtimeMode, base.runtimeMode)
    : (legacyPreviewEnabled === true ? "background_runtime_beta" : sanitizeRuntimeMode(base.runtimeMode));

  return {
    provider: safeProvider,
    model: sanitizeModelForProvider(safeProvider, raw.model || base.model),
    saveMode: sanitizeSaveMode(raw.saveMode, base.saveMode),
    debugEnabled: sanitizeBoolean(raw.debugEnabled, base.debugEnabled),
    runtimeMode
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
        && (incomingModel === undefined || !String(incomingModel).trim() || current.model === oldDefaultModel);
      const nextModel = shouldUseDefaultModel
        ? getDefaultModelForProvider(nextProvider)
        : (incomingModel ?? current.model);
      const next = sanitizePublicSettings({
        provider: nextProvider,
        model: nextModel,
        saveMode: input.saveMode ?? current.saveMode,
        debugEnabled: input.debugEnabled ?? current.debugEnabled,
        runtimeMode: input.runtimeMode ?? (input.backgroundRuntimePreviewEnabled === true || input.backgroundChatPreviewEnabled === true
          ? "background_runtime_beta"
          : current.runtimeMode)
      }, current);

      await setToStorage(next);
      return { ok: true, settings: { ...next } };
    }
  };
}
