"use strict";

require("dotenv").config();

const express = require("express");
const cors = require("cors");
const { runPetLlm } = require("./src/llm");
const { ACTIONS } = require("./src/llm/llmSchemas");

function toBool(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  return ["1", "true", "yes", "on"].includes(String(value).trim().toLowerCase());
}

const Config = Object.freeze({
  version: "0.6.0",
  host: process.env.HOST || "127.0.0.1",
  port: Number(process.env.PORT || 3001),
  maxReplyChars: Number(process.env.MAX_REPLY_CHARS || 0),
  debugLog: toBool(process.env.DEBUG_LOG ?? process.env.DEBUG, false),
  llmDebug: toBool(process.env.LLM_DEBUG, false),
  modelProvider: process.env.MODEL_PROVIDER || "mock",
  modelName: process.env.MODEL_NAME || "mock",
  modelTimeoutMs: Number(process.env.MODEL_TIMEOUT_MS || 20000),
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
    emotion: bubbleType === "error" ? "error" : "confused",
    motion: "idle",
    bubble_type: bubbleType,
    confidence
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
  if (req.path !== "/api/pet" || !Config.localClientToken) return next();

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
    if (req.path !== "/api/pet") return next();

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
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Aflodit-Pet-Token"],
  maxAge: 86400
}));

app.use(express.json({ limit: "2mb" }));
app.use(requireLocalToken);
app.use(rateLimit());

app.post("/api/pet", async (req, res) => {
  const startedAt = Date.now();

  try {
    Logger.debug("Received extension request", JSON.stringify(req.body || {}, null, 2));
    const result = await runPetLlm(req.body, { includeDebug: true });
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
    return res.status(500).json(safeResponse("本地后端异常，请查看终端报错。", "error", 0.3));
  }
});

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    service: "aflodit-pet-copilot-local-server",
    version: Config.version,
    host: Config.host,
    port: Config.port,
    debug_log: Config.debugLog,
    llm_debug: Config.llmDebug,
    model_provider: Config.modelProvider,
    model: Config.modelName,
    model_timeout_ms: Config.modelTimeoutMs,
    rate_limit: { window_ms: Config.rateLimitWindowMs, max: Config.rateLimitMax },
    actions: Object.values(ACTIONS)
  });
});

app.listen(Config.port, Config.host, () => {
  Logger.info(`AFlodit Pet backend running at http://${Config.host}:${Config.port}`);
  Logger.info(`MODEL_PROVIDER=${Config.modelProvider} | MODEL_NAME=${Config.modelName || "mock"} | LLM_DEBUG=${Config.llmDebug ? "true" : "false"}`);
});
