"use strict";

const SECRET_KEYS = new Set([
  "apikey",
  "api_key",
  "authorization",
  "x-aflodit-token",
  "x-aflodit-pet-token",
  "x_aflodit_token",
  "x_aflodit_pet_token",
  "local_client_token",
  "model_api_key"
]);

function maskSecret(value) {
  const text = String(value || "");
  if (!text) return "";
  if (text.length <= 8) return "[secret]";
  return `${text.slice(0, 3)}...[secret]...${text.slice(-4)}`;
}

function redact(value) {
  if (Array.isArray(value)) return value.map(redact);
  if (!value || typeof value !== "object") return value;

  return Object.entries(value).reduce((acc, [key, item]) => {
    const normalizedKey = String(key || "").toLowerCase().replace(/[-\s]/g, "_");
    acc[key] = SECRET_KEYS.has(normalizedKey) ? maskSecret(item) : redact(item);
    return acc;
  }, {});
}

function safeLog(logger, level, message, details) {
  const target = logger || console;
  const fn = typeof target[level] === "function" ? target[level].bind(target) : console.log;
  if (details === undefined) {
    fn(message);
    return;
  }
  fn(message, redact(details));
}

module.exports = {
  maskSecret,
  redact,
  safeLog
};
