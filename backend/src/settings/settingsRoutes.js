"use strict";

const express = require("express");
const { testOpenAICompatibleProvider } = require("../llm/providers/openaiCompatibleProvider");
const {
  getEffectiveSettings,
  getSanitizedSettings,
  readStoredSettings,
  writeSettings
} = require("./settingsStore");
const {
  sanitizeSettings,
  validateSettingsForSave,
  validateSettingsForTest
} = require("./settingsSchema");
const { safeLog } = require("./safeLog");

function getBearerToken(req) {
  const authorization = String(req.get("Authorization") || "").trim();
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (match) return match[1].trim();
  return String(req.get("X-Aflodit-Token") || req.get("X-Aflodit-Pet-Token") || "").trim();
}

function createAuthMiddleware(localClientToken, logger = console) {
  return function requireSettingsToken(req, res, next) {
    if (!localClientToken) return next();
    if (getBearerToken(req) === localClientToken) return next();

    safeLog(logger, "debug", "Blocked unauthenticated settings request", {
      origin: req.get("Origin") || "none",
      ip: req.ip || req.socket?.remoteAddress || "unknown"
    });
    return res.status(403).json({
      error: {
        code: "SETTINGS_AUTH_REQUIRED",
        message: "Local settings token is invalid."
      }
    });
  };
}

function configError(message, details = []) {
  return {
    error: {
      code: "MODEL_CONFIG_INVALID",
      message,
      details
    }
  };
}

function mapProviderError(error) {
  const code = error?.code || "MODEL_NETWORK_ERROR";
  const messages = {
    MODEL_AUTH_FAILED: "Authentication failed. Check your API key.",
    MODEL_TIMEOUT: "Request timed out.",
    MODEL_NETWORK_ERROR: "Network error while contacting the model provider.",
    MODEL_BAD_RESPONSE: "The model provider returned an unexpected response.",
    MODEL_CONFIG_INVALID: "Invalid model settings."
  };
  return {
    ok: false,
    code,
    provider: "openai-compatible",
    model: error?.model || "",
    latencyMs: error?.latencyMs,
    message: messages[code] || messages.MODEL_NETWORK_ERROR
  };
}

async function testSettings(settings) {
  const startedAt = Date.now();
  const model = settings.model || {};

  if (model.provider === "mock") {
    return {
      ok: true,
      provider: "mock",
      model: model.model || "mock",
      latencyMs: Date.now() - startedAt,
      message: "Connected. Mock provider is available."
    };
  }

  if (model.provider === "openai-compatible") {
    try {
      const result = await testOpenAICompatibleProvider({ settings });
      return {
        ok: true,
        provider: "openai-compatible",
        model: model.model,
        latencyMs: result.latencyMs,
        message: `Connected. ${result.latencyMs}ms.`
      };
    } catch (error) {
      return mapProviderError({ ...error, model: model.model });
    }
  }

  return {
    ok: false,
    code: "MODEL_CONFIG_INVALID",
    provider: model.provider || "",
    model: model.model || "",
    latencyMs: Date.now() - startedAt,
    message: "Invalid model settings."
  };
}

function createSettingsRouter({ localClientToken, env = process.env, logger = console } = {}) {
  const router = express.Router();
  router.use(createAuthMiddleware(localClientToken, logger));

  router.get("/", (req, res) => {
    const result = getSanitizedSettings(env);
    return res.json({
      settings: result.settings,
      warnings: result.warnings
    });
  });

  router.put("/", (req, res) => {
    const stored = readStoredSettings();
    const validation = validateSettingsForSave(req.body, stored.settings, env);
    if (!validation.ok) {
      return res.status(400).json(configError("Invalid model settings.", validation.errors));
    }

    try {
      writeSettings(validation.settings);
      const effective = getEffectiveSettings(env);
      return res.json({
        settings: sanitizeSettings(effective.settings),
        warnings: effective.warnings
      });
    } catch (error) {
      safeLog(logger, "error", "Failed to save local settings", {
        message: error?.message,
        code: error?.code
      });
      return res.status(500).json({
        error: {
          code: "SETTINGS_SAVE_FAILED",
          message: "Local settings could not be saved."
        }
      });
    }
  });

  router.post("/test", async (req, res) => {
    const effective = getEffectiveSettings(env);
    const validation = validateSettingsForTest(req.body, effective.settings, env);
    if (!validation.ok) {
      return res.status(400).json({
        ok: false,
        code: "MODEL_CONFIG_INVALID",
        provider: validation.settings.model.provider,
        model: validation.settings.model.model,
        message: "Invalid model settings.",
        details: validation.errors
      });
    }

    const result = await testSettings(validation.settings);
    return res.status(result.ok ? 200 : 200).json(result);
  });

  return router;
}

module.exports = {
  createSettingsRouter,
  createAuthMiddleware,
  getBearerToken
};
