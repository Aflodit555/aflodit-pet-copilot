import { maskSecret } from "./safeLog.js";

const LOCAL_SECRET_KEY = "afloditBackgroundRuntimeSecret";
const SESSION_SECRET_KEY = "afloditBackgroundRuntimeSessionSecret";
const MIN_SECRET_LENGTH = 8;

function normalizeSaveMode(saveMode) {
  return saveMode === "session" ? "session" : "local";
}

function normalizeSecret(secret) {
  return typeof secret === "string" ? secret.trim() : "";
}

function normalizeProviderId(providerId = "") {
  const normalized = typeof providerId === "string" ? providerId.trim().slice(0, 64) : "";
  return /^[a-z0-9_-]+$/i.test(normalized) ? normalized : "";
}

function storageArea(chromeApi, saveMode) {
  if (saveMode === "session") return chromeApi?.storage?.session || null;
  return chromeApi?.storage?.local || null;
}

function storageKey(saveMode) {
  return saveMode === "session" ? SESSION_SECRET_KEY : LOCAL_SECRET_KEY;
}

function emptyState() {
  return { runtimeKeys: {} };
}

function sanitizeState(value) {
  const state = emptyState();
  if (typeof value === "string") {
    const legacySecret = normalizeSecret(value);
    if (legacySecret) state.legacySecret = legacySecret;
    return state;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return state;

  const runtimeKeys = value.runtimeKeys && typeof value.runtimeKeys === "object" && !Array.isArray(value.runtimeKeys)
    ? value.runtimeKeys
    : {};
  for (const [providerId, secret] of Object.entries(runtimeKeys)) {
    const normalizedProviderId = normalizeProviderId(providerId);
    const normalizedSecret = normalizeSecret(secret);
    if (normalizedProviderId && normalizedSecret) {
      state.runtimeKeys[normalizedProviderId] = normalizedSecret;
    }
  }

  const legacySecret = normalizeSecret(value.legacySecret);
  if (legacySecret) state.legacySecret = legacySecret;
  return state;
}

function setAccessLevel(area, logger, label) {
  if (!area?.setAccessLevel) return Promise.resolve(false);
  return new Promise((resolve) => {
    try {
      area.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" }, () => {
        resolve(true);
      });
    } catch (error) {
      logger?.warn?.("Storage access level setup skipped.", { area: label, reason: error?.message });
      resolve(false);
    }
  });
}

function getFromStorage(chromeApi, area, key) {
  if (!area?.get) return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      area.get(key, (result = {}) => {
        if (chromeApi?.runtime?.lastError) {
          resolve(null);
          return;
        }
        resolve(result[key]);
      });
    } catch {
      resolve(null);
    }
  });
}

function setToStorage(area, key, value) {
  if (!area?.set) return Promise.resolve(false);
  return new Promise((resolve) => {
    try {
      area.set({ [key]: value }, () => resolve(true));
    } catch {
      resolve(false);
    }
  });
}

function removeFromStorage(area, key) {
  if (!area?.remove) return Promise.resolve(false);
  return new Promise((resolve) => {
    try {
      area.remove(key, () => resolve(true));
    } catch {
      resolve(false);
    }
  });
}

export function createSecretStore(chromeApi, logger) {
  let memory = {
    local: emptyState(),
    session: emptyState()
  };

  async function initializeAccessLevels() {
    await Promise.all([
      setAccessLevel(chromeApi?.storage?.local, logger, "local"),
      setAccessLevel(chromeApi?.storage?.session, logger, "session")
    ]);
  }

  async function readState(saveMode = "local") {
    const mode = normalizeSaveMode(saveMode);
    const area = storageArea(chromeApi, mode);
    const stored = await getFromStorage(chromeApi, area, storageKey(mode));
    const state = sanitizeState(stored ?? memory[mode]);
    memory[mode] = state;
    return state;
  }

  async function writeState(saveMode = "local", state = emptyState()) {
    const mode = normalizeSaveMode(saveMode);
    const normalized = sanitizeState(state);
    memory[mode] = normalized;
    await setToStorage(storageArea(chromeApi, mode), storageKey(mode), normalized);
    return normalized;
  }

  async function readSecret(saveMode = "local", providerId = "") {
    const normalizedProviderId = normalizeProviderId(providerId);
    const state = await readState(saveMode);
    if (normalizedProviderId) return state.runtimeKeys[normalizedProviderId] || "";
    return Object.values(state.runtimeKeys).find(Boolean) || state.legacySecret || "";
  }

  return {
    async saveSecret(secret, options = {}) {
      await initializeAccessLevels();
      const normalized = normalizeSecret(secret);
      if (normalized.length < MIN_SECRET_LENGTH) {
        return {
          ok: false,
          error: {
            code: "SECRET_INVALID",
            message: "Runtime API Key is empty or too short."
          }
        };
      }

      const providerId = normalizeProviderId(options.providerId);
      if (!providerId) {
        return {
          ok: false,
          error: {
            code: "SECRET_PROVIDER_INVALID",
            message: "Runtime API Key must be saved for a valid provider."
          }
        };
      }

      const saveMode = normalizeSaveMode(options.saveMode);
      const state = await readState(saveMode);
      state.runtimeKeys[providerId] = normalized;
      await writeState(saveMode, state);

      return {
        ok: true,
        providerId,
        hasApiKey: true,
        apiKeyPreview: maskSecret(normalized),
        saveMode
      };
    },

    async hasSecret(saveMode = null, providerId = "") {
      if (saveMode) return Boolean(await readSecret(saveMode, providerId));
      return Boolean((await readSecret("session", providerId)) || (await readSecret("local", providerId)));
    },

    async getMaskedPreview(saveMode = null, providerId = "") {
      const secret = saveMode
        ? await readSecret(saveMode, providerId)
        : ((await readSecret("session", providerId)) || (await readSecret("local", providerId)));
      return secret ? maskSecret(secret) : "";
    },

    async clearSecret(options = {}) {
      const providerId = normalizeProviderId(options.providerId);
      if (providerId) {
        for (const mode of ["local", "session"]) {
          const state = await readState(mode);
          delete state.runtimeKeys[providerId];
          await writeState(mode, state);
        }
        return { ok: true, cleared: true, providerId };
      }

      memory = { local: emptyState(), session: emptyState() };
      await Promise.all([
        removeFromStorage(chromeApi?.storage?.local, LOCAL_SECRET_KEY),
        removeFromStorage(chromeApi?.storage?.session, SESSION_SECRET_KEY)
      ]);
      return { ok: true, cleared: true };
    },

    async getSecretForTrustedRuntimeOnly(saveMode = null, providerId = "") {
      if (saveMode) return readSecret(saveMode, providerId);
      return (await readSecret("session", providerId)) || (await readSecret("local", providerId));
    }
  };
}
