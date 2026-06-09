const SECRET_PATTERN = /(api[_-]?key|authorization|bearer\s+[a-z0-9._~+/=-]+)/i;

export function maskSecret(value) {
  const text = String(value ?? "");
  if (!text) return "";
  if (text.length <= 8) return "****";
  return `${text.slice(0, 3)}...${text.slice(-4)}`;
}

function sanitizeValue(value) {
  if (typeof value === "string") {
    return SECRET_PATTERN.test(value) ? maskSecret(value) : value;
  }

  if (!value || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(sanitizeValue);

  return Object.keys(value).reduce((acc, key) => {
    if (/api[_-]?key|authorization|headers|body|raw/i.test(key)) {
      acc[key] = "[redacted]";
    } else {
      acc[key] = sanitizeValue(value[key]);
    }
    return acc;
  }, {});
}

export function createSafeLogger({ enabled = false, namespace = "AFlodit Background" } = {}) {
  return {
    debug(message, data = undefined) {
      if (!enabled) return;
      if (data === undefined) {
        console.debug(`[${namespace}]`, sanitizeValue(message));
        return;
      }
      console.debug(`[${namespace}]`, sanitizeValue(message), sanitizeValue(data));
    },

    warn(message, data = undefined) {
      if (!enabled) return;
      if (data === undefined) {
        console.warn(`[${namespace}]`, sanitizeValue(message));
        return;
      }
      console.warn(`[${namespace}]`, sanitizeValue(message), sanitizeValue(data));
    }
  };
}
