export const MESSAGE_TYPES = Object.freeze({
  runtimeGetStatus: "runtime:getStatus",
  runtimeTestConnectionMock: "runtime:testConnectionMock",
  runtimeGetProviderPermissionStatus: "runtime:getProviderPermissionStatus",
  runtimeRequestProviderPermission: "runtime:requestProviderPermission",
  settingsGetPublic: "settings:getPublic",
  settingsSavePublic: "settings:savePublic",
  settingsSaveSecret: "settings:saveSecret",
  settingsClearKey: "settings:clearKey"
});

export const ALLOWED_MESSAGE_TYPES = Object.freeze([
  MESSAGE_TYPES.runtimeGetStatus,
  MESSAGE_TYPES.runtimeTestConnectionMock,
  MESSAGE_TYPES.runtimeGetProviderPermissionStatus,
  MESSAGE_TYPES.runtimeRequestProviderPermission,
  MESSAGE_TYPES.settingsGetPublic,
  MESSAGE_TYPES.settingsSavePublic,
  MESSAGE_TYPES.settingsSaveSecret,
  MESSAGE_TYPES.settingsClearKey
]);

export const BLOCKED_MESSAGE_TYPES = Object.freeze([
  "fetch",
  "proxy",
  "request:url",
  "settings:getSecret",
  "provider:rawCall",
  "debug:getRawRequest",
  "debug:getSecret",
  "storage:getRaw",
  "storage:dump"
]);

const FORBIDDEN_PAYLOAD_KEYS = Object.freeze([
  "url",
  "baseUrl",
  "endpoint",
  "origin",
  "chatPath",
  "headers",
  "authorization",
  "method",
  "body",
  "rawBody",
  "token",
  "bearer"
]);

const SECRET_PAYLOAD_KEYS = Object.freeze(["apiKey", "secret"]);

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

  if (hasOwn(message, "payload") && (message.payload === null || typeof message.payload !== "object" || Array.isArray(message.payload))) {
    return {
      ok: false,
      error: {
        code: "MESSAGE_PAYLOAD_INVALID",
        message: "Runtime message payload must be an object when provided."
      }
    };
  }

  if (
    type === MESSAGE_TYPES.runtimeTestConnectionMock
    || type === MESSAGE_TYPES.runtimeGetProviderPermissionStatus
    || type === MESSAGE_TYPES.runtimeRequestProviderPermission
  ) {
    return { ok: true, type, payload: message.payload || {} };
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

  if (type === "settings:saveSecret") {
    const payload = message.payload || {};
    const keys = Object.keys(payload);
    const secretKeys = keys.filter((key) => SECRET_PAYLOAD_KEYS.includes(key));
    const unsupportedKey = keys.find((key) => !SECRET_PAYLOAD_KEYS.includes(key));

    if (unsupportedKey) {
      return {
        ok: false,
        error: {
          code: "MESSAGE_PAYLOAD_FORBIDDEN",
          message: `Runtime secret payload contains forbidden field: ${unsupportedKey}`
        }
      };
    }

    if (secretKeys.length !== 1) {
      return {
        ok: false,
        error: {
          code: "SECRET_PAYLOAD_INVALID",
          message: "Runtime secret payload must include exactly one apiKey or secret field."
        }
      };
    }
  } else if (findForbiddenKey({ payload: message.payload || {} }) || hasOwn(message.payload || {}, "apiKey") || hasOwn(message.payload || {}, "secret")) {
    return {
      ok: false,
      error: {
        code: "MESSAGE_PAYLOAD_FORBIDDEN",
        message: "Runtime message payload contains forbidden secret or request field."
      }
    };
  }

  return { ok: true, type, payload: message.payload || {} };
}
