export const ALLOWED_MESSAGE_TYPES = Object.freeze([
  "runtime:getStatus",
  "settings:getPublic",
  "settings:savePublic",
  "settings:clearKey"
]);

export const BLOCKED_MESSAGE_TYPES = Object.freeze([
  "fetch",
  "proxy",
  "request:url",
  "settings:getSecret",
  "settings:saveSecret",
  "provider:rawCall",
  "debug:getRawRequest"
]);

const FORBIDDEN_PAYLOAD_KEYS = Object.freeze([
  "url",
  "baseUrl",
  "endpoint",
  "headers",
  "authorization",
  "method",
  "body",
  "rawBody",
  "apiKey"
]);

function hasOwn(value, key) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function findForbiddenKey(value, path = "") {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";

  for (const key of Object.keys(value)) {
    const normalized = key.toLowerCase();
    const currentPath = path ? `${path}.${key}` : key;
    if (FORBIDDEN_PAYLOAD_KEYS.some((blocked) => blocked.toLowerCase() === normalized)) {
      return currentPath;
    }

    const nested = findForbiddenKey(value[key], currentPath);
    if (nested) return nested;
  }

  return "";
}

export function validateMessage(message) {
  if (!message || typeof message !== "object" || Array.isArray(message)) {
    return {
      ok: false,
      error: {
        code: "MESSAGE_INVALID",
        message: "Runtime message must be an object."
      }
    };
  }

  const type = typeof message.type === "string" ? message.type : "";
  if (!type) {
    return {
      ok: false,
      error: {
        code: "MESSAGE_TYPE_REQUIRED",
        message: "Runtime message type is required."
      }
    };
  }

  if (BLOCKED_MESSAGE_TYPES.includes(type)) {
    return {
      ok: false,
      error: {
        code: "MESSAGE_TYPE_FORBIDDEN",
        message: `Runtime message type is forbidden: ${type}`
      }
    };
  }

  if (!ALLOWED_MESSAGE_TYPES.includes(type)) {
    return {
      ok: false,
      error: {
        code: "MESSAGE_TYPE_UNSUPPORTED",
        message: `Runtime message type is not supported: ${type}`
      }
    };
  }

  const forbiddenKey = findForbiddenKey(message);
  if (forbiddenKey && forbiddenKey !== "type") {
    return {
      ok: false,
      error: {
        code: "MESSAGE_PAYLOAD_FORBIDDEN",
        message: `Runtime message payload contains forbidden field: ${forbiddenKey}`
      }
    };
  }

  if (hasOwn(message, "payload") && (message.payload === null || typeof message.payload !== "object" || Array.isArray(message.payload))) {
    return {
      ok: false,
      error: {
        code: "MESSAGE_PAYLOAD_INVALID",
        message: "Runtime message payload must be an object when provided."
      }
    };
  }

  return { ok: true, type, payload: message.payload || {} };
}
