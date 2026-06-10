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

function storageArea(chromeApi, saveMode) {
  if (saveMode === "session") return chromeApi?.storage?.session || null;
  return chromeApi?.storage?.local || null;
}

function storageKey(saveMode) {
  return saveMode === "session" ? SESSION_SECRET_KEY : LOCAL_SECRET_KEY;
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
  if (!area?.get) return Promise.resolve("");
  return new Promise((resolve) => {
    try {
      area.get(key, (result = {}) => {
        if (chromeApi?.runtime?.lastError) {
          resolve("");
          return;
        }
        resolve(normalizeSecret(result[key]));
      });
    } catch {
      resolve("");
    }
  });
}

function setToStorage(area, key, secret) {
  if (!area?.set) return Promise.resolve(false);
  return new Promise((resolve) => {
    try {
      area.set({ [key]: secret }, () => resolve(true));
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
    local: "",
    session: ""
  };

  async function initializeAccessLevels() {
    await Promise.all([
      setAccessLevel(chromeApi?.storage?.local, logger, "local"),
      setAccessLevel(chromeApi?.storage?.session, logger, "session")
    ]);
  }

  async function readSecret(saveMode = "local") {
    const mode = normalizeSaveMode(saveMode);
    const area = storageArea(chromeApi, mode);
    const stored = await getFromStorage(chromeApi, area, storageKey(mode));
    if (stored) {
      memory[mode] = stored;
      return stored;
    }
    return memory[mode] || "";
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

      const saveMode = normalizeSaveMode(options.saveMode);
      memory[saveMode] = normalized;
      const area = storageArea(chromeApi, saveMode);
      await setToStorage(area, storageKey(saveMode), normalized);

      return {
        ok: true,
        hasApiKey: true,
        apiKeyPreview: maskSecret(normalized),
        saveMode
      };
    },

    async hasSecret(saveMode = null) {
      if (saveMode) return Boolean(await readSecret(saveMode));
      return Boolean((await readSecret("session")) || (await readSecret("local")));
    },

    async getMaskedPreview(saveMode = null) {
      const secret = saveMode
        ? await readSecret(saveMode)
        : ((await readSecret("session")) || (await readSecret("local")));
      return secret ? maskSecret(secret) : "";
    },

    async clearSecret() {
      memory = { local: "", session: "" };
      await Promise.all([
        removeFromStorage(chromeApi?.storage?.local, LOCAL_SECRET_KEY),
        removeFromStorage(chromeApi?.storage?.session, SESSION_SECRET_KEY)
      ]);
      return { ok: true, cleared: true };
    },

    async getSecretForTrustedRuntimeOnly(saveMode = null) {
      if (saveMode) return readSecret(saveMode);
      return (await readSecret("session")) || (await readSecret("local"));
    }
  };
}
