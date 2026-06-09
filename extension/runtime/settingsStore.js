import { getProvider, hasProvider } from "./providerRegistry.js";
import { validatePublicSettings } from "./permissionGuard.js";

const STORAGE_KEY = "afloditBackgroundRuntimePublicSettings";

const DEFAULT_SETTINGS = Object.freeze({
  provider: "mock",
  model: "mock-model",
  saveMode: "local",
  debugEnabled: false
});

function sanitizeBoolean(value, fallback) {
  return typeof value === "boolean" ? value : fallback;
}

function sanitizeString(value, fallback, maxLength = 120) {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : fallback;
}

export function sanitizePublicSettings(raw = {}, base = DEFAULT_SETTINGS) {
  const provider = sanitizeString(raw.provider, base.provider, 64);
  const safeProvider = hasProvider(provider) ? provider : base.provider;
  const providerInfo = getProvider(safeProvider);

  return {
    provider: safeProvider,
    model: sanitizeString(raw.model, base.model || providerInfo?.defaultModel || "mock-model", 120),
    saveMode: sanitizeString(raw.saveMode, base.saveMode, 32),
    debugEnabled: sanitizeBoolean(raw.debugEnabled, base.debugEnabled)
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
      const next = sanitizePublicSettings({
        provider: input.provider ?? current.provider,
        model: input.model ?? current.model,
        saveMode: input.saveMode ?? current.saveMode,
        debugEnabled: input.debugEnabled ?? current.debugEnabled
      }, current);

      await setToStorage(next);
      return { ok: true, settings: { ...next } };
    }
  };
}
