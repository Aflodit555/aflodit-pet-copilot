"use strict";

require("dotenv").config();

const express = require("express");
const cors = require("cors");
const { runPetLlm, runPetLlmStream } = require("./src/llm");
const { ACTIONS } = require("./src/llm/llmSchemas");
const { createSettingsRouter } = require("./src/settings/settingsRoutes");
const { getRuntimeEnv, getEffectiveSettings } = require("./src/settings/settingsStore");
const { AFLODIT_FIXED_TIMEOUT_MS } = require("./src/settings/settingsSchema");

function toBool(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  return ["1", "true", "yes", "on"].includes(String(value).trim().toLowerCase());
}

const configuredModelProvider = process.env.MODEL_PROVIDER || "mock";
const normalizedConfiguredProvider = String(configuredModelProvider).trim().toLowerCase();
const configuredModelName = process.env.MODEL_NAME || (normalizedConfiguredProvider === "mock" ? "mock" : "");

const Config = Object.freeze({
  appName: "AFlodit Pet Copilot",
  version: "0.7.0.9",
  runtimeName: "difyless-llm-runtime",
  runtimeType: "local-provider-llm-runtime",
  host: process.env.HOST || "127.0.0.1",
  port: Number(process.env.PORT || 3001),
  maxReplyChars: Number(process.env.MAX_REPLY_CHARS || 0),
  debugLog: toBool(process.env.DEBUG_LOG ?? process.env.DEBUG, false),
  llmDebug: toBool(process.env.LLM_DEBUG, false),
  modelProvider: configuredModelProvider,
  modelName: configuredModelName,
  modelBaseUrl: process.env.MODEL_BASE_URL || "",
  modelResponseFormat: process.env.MODEL_RESPONSE_FORMAT || "",
  modelApiKeyPresent: Boolean(String(process.env.MODEL_API_KEY || "").trim()),
  modelTimeoutMs: AFLODIT_FIXED_TIMEOUT_MS,
  rateLimitWindowMs: Number(process.env.RATE_LIMIT_WINDOW_MS || 60000),
  rateLimitMax: Number(process.env.RATE_LIMIT_MAX || 30),
  corsAllowAll: toBool(process.env.CORS_ALLOW_ALL, false),
  corsAllowedOrigins: String(process.env.CORS_ALLOWED_ORIGINS || "").split(",").map((item) => item.trim()).filter(Boolean),
  localClientToken: process.env.LOCAL_CLIENT_TOKEN || "aflodit-pet-local-dev"
});

const Logger = {
  debug: (...args) => Config.debugLog && console.log(...args),
  info: (...args) => console.log(...args),
  error: (...args) => console.error(...args)
};

function safeResponse(message, bubbleType = "error", confidence = 0.3) {
  return {
    reply: message,
    emotion: bubbleType === "error" ? "neutral" : "confused",
    motion: "idle",
    bubble_type: bubbleType,
    confidence
  };
}

function safeUrlInfo(value) {
  const raw = String(value || "").trim();
  if (!raw) return { configured: false };

  try {
    const url = new URL(raw);
    return {
      configured: true,
      origin: url.origin,
      pathname: url.pathname,
      has_query: Boolean(url.search),
      has_hash: Boolean(url.hash)
    };
  } catch {
    return {
      configured: true,
      invalid: true
    };
  }
}

function getModelConfigStatus(modelSettings) {
  const provider = String(modelSettings?.provider || Config.modelProvider || "mock").trim().toLowerCase();
  const missing = [];

  if (provider === "mock") {
    return {
      present: true,
      missing,
      required: []
    };
  }

  if (provider === "openai-compatible" || provider === "openai_compatible" || provider === "openai") {
    if (!String(modelSettings?.baseUrl || "").trim()) missing.push("MODEL_BASE_URL");
    if (!String(modelSettings?.apiKey || "").trim()) missing.push("MODEL_API_KEY");
    if (!String(modelSettings?.model || "").trim()) missing.push("MODEL_NAME");
    return {
      present: missing.length === 0,
      missing,
      required: ["MODEL_BASE_URL", "MODEL_API_KEY", "MODEL_NAME"]
    };
  }

  return {
    present: false,
    missing: [`unsupported provider: ${provider || "empty"}`],
    required: ["MODEL_PROVIDER"]
  };
}

function runtimeStatus() {
  const effective = getEffectiveSettings(process.env);
  const modelSettings = effective.settings.model;
  const modelConfig = getModelConfigStatus(modelSettings);

  return {
    ok: true,
    backend_status: "running",
    app: {
      name: Config.appName,
      version: Config.version
    },
    runtime: {
      name: Config.runtimeName,
      type: Config.runtimeType
    },
    config_source: effective.exists ? "local-settings+environment" : "environment",
    provider: {
      name: modelSettings.provider || "mock",
      model: modelSettings.model || "",
      response_format: Config.modelResponseFormat || "",
      base_url: safeUrlInfo(modelSettings.baseUrl),
      api_key_present: Boolean(String(modelSettings.apiKey || "").trim()),
      required_config_present: modelConfig.present,
      missing_config: modelConfig.missing,
      required_config: modelConfig.required
    },
    llm_debug: Config.llmDebug,
    timeout_ms: AFLODIT_FIXED_TIMEOUT_MS,
    server: {
      host: Config.host,
      port: Config.port,
      uptime_seconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString()
    },
    rate_limit: { window_ms: Config.rateLimitWindowMs, max: Config.rateLimitMax },
    actions: Object.values(ACTIONS),
    settings: {
      local_file_present: effective.exists,
      warnings: effective.warnings
    },
    experimental: {
      pet_stream: true
    }
  };
}

function applyReplyLimit(response) {
  if (!response || Config.maxReplyChars <= 0 || typeof response.reply !== "string") return response;
  if (response.reply.length <= Config.maxReplyChars) return response;
  return {
    ...response,
    reply: `${response.reply.slice(0, Math.max(0, Config.maxReplyChars - 3))}...`
  };
}

function isPetRequestPath(path) {
  return path === "/api/pet" || path === "/api/pet-stream";
}

function isAllowedOrigin(origin) {
  if (!origin || Config.corsAllowAll) return true;
  if (Config.corsAllowedOrigins.length > 0) return Config.corsAllowedOrigins.includes(origin);

  return (
    /^chrome-extension:\/\/[a-z]+$/i.test(origin) ||
    /^moz-extension:\/\/[a-z0-9-]+$/i.test(origin) ||
    /^https?:\/\//i.test(origin) ||
    /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin)
  );
}

function requireLocalToken(req, res, next) {
  if (!isPetRequestPath(req.path) || !Config.localClientToken) return next();

  if (req.get("X-Aflodit-Pet-Token") !== Config.localClientToken) {
    Logger.debug("Blocked invalid local token", {
      origin: req.get("Origin") || "none",
      ip: req.ip || req.socket?.remoteAddress || "unknown"
    });
    return res.status(403).json(safeResponse("本地后端拒绝了这个请求：客户端令牌无效。", "error", 0.3));
  }

  next();
}

function rateLimit() {
  const buckets = new Map();

  return function rateLimitMiddleware(req, res, next) {
    if (!isPetRequestPath(req.path)) return next();

    const now = Date.now();
    const key = req.ip || req.socket?.remoteAddress || "local";
    const recent = (buckets.get(key) || []).filter((time) => now - time < Config.rateLimitWindowMs);

    if (recent.length >= Config.rateLimitMax) {
      Logger.debug("Rate limit hit", { key, count: recent.length });
      return res.status(429).json(safeResponse("请求过于频繁，请稍后再试。", "warning", 0.4));
    }

    recent.push(now);
    buckets.set(key, recent);

    if (buckets.size > 200) {
      for (const [bucketKey, times] of buckets.entries()) {
        const active = times.filter((time) => now - time < Config.rateLimitWindowMs);
        active.length ? buckets.set(bucketKey, active) : buckets.delete(bucketKey);
      }
    }

    next();
  };
}

const app = express();

app.use(cors({
  origin(origin, callback) {
    if (isAllowedOrigin(origin)) return callback(null, true);
    Logger.debug("CORS blocked origin:", origin);
    return callback(null, false);
  },
  methods: ["GET", "POST", "PUT", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Aflodit-Token", "X-Aflodit-Pet-Token"],
  maxAge: 86400
}));

app.use(express.json({ limit: "2mb" }));
app.use(requireLocalToken);
app.use(rateLimit());
app.use("/api/settings", createSettingsRouter({
  localClientToken: Config.localClientToken,
  env: process.env,
  logger: Logger
}));

app.post("/api/pet", async (req, res) => {
  const startedAt = Date.now();

  try {
    const runtime = getRuntimeEnv(process.env);
    const result = await runPetLlm(req.body, { includeDebug: Config.llmDebug, logger: console, env: runtime.env });
    const limited = applyReplyLimit(result);

    if (limited.debug) {
      limited.debug.durationMs = Date.now() - startedAt;
      Logger.debug("Returning pet response", JSON.stringify({
        ...limited,
        debug: {
          ...limited.debug,
          rawModelText: limited.debug.rawModelText ? "[hidden in logs]" : undefined
        }
      }, null, 2));
    }

    return res.json(limited);
  } catch (err) {
    Logger.error("Backend error:", err);
    return res.status(200).json({
      ...safeResponse("模型暂时没有返回有效结果，请稍后再试。", "error", 0.3),
      error_code: "MODEL_BAD_RESPONSE"
    });
  }
});

function writeStreamEvent(res, event) {
  if (res.writableEnded || res.destroyed) return;
  const safeEvent = { streamExperimental: true, ...event };
  if ((safeEvent.type === "final" || safeEvent.type === "error") && safeEvent.data) {
    safeEvent.data = applyReplyLimit(safeEvent.data);
  }
  if (safeEvent.debug && !Config.llmDebug) delete safeEvent.debug;
  res.write(`${JSON.stringify(safeEvent)}\n`);
}

app.post("/api/pet-stream", async (req, res) => {
  res.status(200);
  res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  try {
    const runtime = getRuntimeEnv(process.env);
    await runPetLlmStream(req.body, {
      includeDebug: Config.llmDebug,
      env: runtime.env,
      logger: console,
      onEvent(event) {
        writeStreamEvent(res, event);
      }
    });
  } catch (err) {
    Logger.error("Backend stream error:", err);
    writeStreamEvent(res, {
      type: "error",
      data: {
        reply: "\u6a21\u578b\u6682\u65f6\u6ca1\u6709\u8fd4\u56de\u6709\u6548\u7ed3\u679c\u3002",
        emotion: "error",
        motion: "shake",
        bubble_type: "error",
        confidence: 0.3
      }
    });
  } finally {
    if (!res.writableEnded && !res.destroyed) res.end();
  }
});

app.get("/api/runtime-status", (req, res) => res.json(runtimeStatus()));
app.get("/api/health", (req, res) => res.json(runtimeStatus()));
app.get("/health", (req, res) => res.json(runtimeStatus()));

app.listen(Config.port, Config.host, () => {
  Logger.info(`AFlodit Pet backend running at http://${Config.host}:${Config.port}`);
  Logger.info(`MODEL_PROVIDER=${Config.modelProvider} | MODEL_NAME=${Config.modelName || "mock"} | LLM_DEBUG=${Config.llmDebug ? "true" : "false"}`);
});
