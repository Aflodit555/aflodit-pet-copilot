export const CUSTOM_OPENAI_COMPATIBLE_PROVIDER_ID = "custom_openai_compatible";

const CUSTOM_CHAT_PATH = "/chat/completions";
const CUSTOM_BASE_URL_MAX = 240;
const CUSTOM_NAME_MAX = 80;

const PROVIDERS = Object.freeze({
  mock: Object.freeze({
    id: "mock",
    displayName: "Mock",
    protocol: "mock",
    origin: "",
    chatPath: "",
    defaultModel: "mock-model",
    enabled: true,
    requestEnabled: false,
    customEndpoint: false
  }),
  openai: Object.freeze({
    id: "openai",
    displayName: "OpenAI",
    protocol: "openai-compatible",
    origin: "https://api.openai.com",
    baseURL: "https://api.openai.com/v1",
    chatPath: CUSTOM_CHAT_PATH,
    requiredHostPermission: "https://api.openai.com/*",
    defaultModel: "gpt-4o-mini",
    setupHint: "Use OpenAI API Key.",
    enabled: true,
    requestEnabled: false,
    customEndpoint: false
  }),
  deepseek: Object.freeze({
    id: "deepseek",
    displayName: "DeepSeek",
    protocol: "openai-compatible",
    origin: "https://api.deepseek.com",
    baseURL: "https://api.deepseek.com",
    chatPath: CUSTOM_CHAT_PATH,
    requiredHostPermission: "https://api.deepseek.com/*",
    defaultModel: "deepseek-chat",
    setupHint: "Use DeepSeek API Key. Default model: deepseek-chat.",
    enabled: true,
    requestEnabled: false,
    customEndpoint: false
  }),
  dashscope: Object.freeze({
    id: "dashscope",
    displayName: "Alibaba Bailian / DashScope",
    protocol: "openai-compatible",
    origin: "https://dashscope.aliyuncs.com",
    baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    chatPath: CUSTOM_CHAT_PATH,
    requiredHostPermission: "https://dashscope.aliyuncs.com/*",
    defaultModel: "qwen-plus",
    setupHint: "Use Alibaba Cloud Model Studio / Bailian API Key. Start with qwen-plus.",
    enabled: true,
    requestEnabled: false,
    customEndpoint: false
  }),
  openrouter: Object.freeze({
    id: "openrouter",
    displayName: "OpenRouter",
    protocol: "openai-compatible",
    origin: "https://openrouter.ai",
    baseURL: "https://openrouter.ai/api/v1",
    chatPath: CUSTOM_CHAT_PATH,
    requiredHostPermission: "https://openrouter.ai/*",
    defaultModel: "openai/gpt-4o-mini",
    setupHint: "Use OpenRouter API Key. Model names are OpenRouter slugs.",
    enabled: true,
    requestEnabled: false,
    customEndpoint: false
  }),
  [CUSTOM_OPENAI_COMPATIBLE_PROVIDER_ID]: Object.freeze({
    id: CUSTOM_OPENAI_COMPATIBLE_PROVIDER_ID,
    displayName: "Custom OpenAI-compatible",
    protocol: "openai-compatible",
    origin: "",
    baseURL: "",
    chatPath: CUSTOM_CHAT_PATH,
    requiredHostPermission: "",
    defaultModel: "",
    setupHint: "Advanced: enter an HTTPS OpenAI-compatible Base URL, Model ID, and Runtime Key.",
    enabled: true,
    requestEnabled: false,
    customEndpoint: "safe_openai_compatible",
    customConfigured: false
  })
});

const DEFAULT_PROVIDER_ID = "mock";

function sanitizeDisplayName(value = "") {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed.slice(0, CUSTOM_NAME_MAX);
}

function isPrivateIPv4(hostname = "") {
  const parts = hostname.split(".");
  if (parts.length !== 4 || !parts.every((part) => /^\d+$/.test(part))) return false;
  const nums = parts.map((part) => Number(part));
  if (!nums.every((num) => Number.isInteger(num) && num >= 0 && num <= 255)) return true;
  const [a, b] = nums;
  return a === 0
    || a === 10
    || a === 127
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168);
}

function isBlockedHostname(hostname = "") {
  const lower = hostname.toLowerCase();
  if (!lower) return true;
  if (lower === "localhost" || lower.endsWith(".localhost") || lower.endsWith(".local")) return true;
  if (lower === "0.0.0.0" || lower === "::1" || lower === "[::1]") return true;
  if (lower.includes(":")) return true;
  return isPrivateIPv4(lower);
}

function normalizeCustomBaseURL(rawBaseURL = "") {
  const raw = typeof rawBaseURL === "string" ? rawBaseURL.trim() : "";
  if (!raw || raw.length > CUSTOM_BASE_URL_MAX) {
    return { ok: false, errorCode: "CUSTOM_BASE_URL_INVALID", message: "Custom Base URL is required and must be under 240 characters." };
  }

  let url;
  try {
    url = new URL(raw);
  } catch (_) {
    return { ok: false, errorCode: "CUSTOM_BASE_URL_INVALID", message: "Custom Base URL must be a valid URL, such as https://example.com/v1." };
  }

  if (url.protocol !== "https:") {
    return { ok: false, errorCode: "CUSTOM_BASE_URL_HTTPS_REQUIRED", message: "Custom Base URL must use HTTPS." };
  }
  if (url.username || url.password) {
    return { ok: false, errorCode: "CUSTOM_BASE_URL_CREDENTIALS_FORBIDDEN", message: "Custom Base URL cannot include username or password." };
  }
  if (url.search || url.hash) {
    return { ok: false, errorCode: "CUSTOM_BASE_URL_QUERY_FORBIDDEN", message: "Custom Base URL cannot include query string or hash." };
  }
  if (isBlockedHostname(url.hostname)) {
    return { ok: false, errorCode: "CUSTOM_BASE_URL_PRIVATE_NETWORK_FORBIDDEN", message: "Custom Base URL cannot point to localhost, private IP, or local network hosts in this release." };
  }

  let pathname = url.pathname.replace(/\/+$/g, "");
  if (pathname.toLowerCase().endsWith(CUSTOM_CHAT_PATH)) {
    pathname = pathname.slice(0, -CUSTOM_CHAT_PATH.length).replace(/\/+$/g, "");
  }

  const baseURL = `${url.origin}${pathname}`.replace(/\/+$/g, "");
  if (!baseURL || baseURL.length > CUSTOM_BASE_URL_MAX) {
    return { ok: false, errorCode: "CUSTOM_BASE_URL_INVALID", message: "Custom Base URL is invalid after normalization." };
  }

  return {
    ok: true,
    baseURL,
    origin: url.origin,
    requiredHostPermission: `${url.origin}/*`
  };
}

export function normalizeCustomProviderConfig(input = null) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return {
      ok: false,
      error: {
        code: "CUSTOM_PROVIDER_INVALID",
        message: "Custom OpenAI-compatible provider config is required."
      }
    };
  }

  const rawBaseURL = input.baseURL ?? input.baseUrl ?? "";
  const normalized = normalizeCustomBaseURL(rawBaseURL);
  if (!normalized.ok) {
    return {
      ok: false,
      error: {
        code: normalized.errorCode,
        message: normalized.message
      }
    };
  }

  const name = sanitizeDisplayName(input.name) || "Custom OpenAI-compatible";
  return {
    ok: true,
    config: {
      name,
      baseURL: normalized.baseURL,
      origin: normalized.origin,
      chatPath: CUSTOM_CHAT_PATH,
      requiredHostPermission: normalized.requiredHostPermission,
      allowPrivateNetwork: false
    }
  };
}

export function sanitizeCustomProviderConfig(input = null) {
  if (!input) return null;
  const result = normalizeCustomProviderConfig(input);
  return result.ok ? result.config : null;
}

export function buildCustomProvider(customProvider = null) {
  const base = PROVIDERS[CUSTOM_OPENAI_COMPATIBLE_PROVIDER_ID];
  const normalized = sanitizeCustomProviderConfig(customProvider);
  if (!normalized) return { ...base };
  return {
    ...base,
    displayName: normalized.name || base.displayName,
    origin: normalized.origin,
    baseURL: normalized.baseURL,
    chatPath: normalized.chatPath || CUSTOM_CHAT_PATH,
    requiredHostPermission: normalized.requiredHostPermission,
    customConfigured: true
  };
}

export function listProviders(customProvider = null) {
  return Object.values(PROVIDERS).map((provider) => (
    provider.id === CUSTOM_OPENAI_COMPATIBLE_PROVIDER_ID ? buildCustomProvider(customProvider) : provider
  ));
}

export function listPublicProviders(customProvider = null) {
  return listProviders(customProvider).map((provider) => ({
    id: provider.id,
    displayName: provider.displayName,
    protocol: provider.protocol,
    defaultModel: provider.defaultModel,
    setupHint: provider.setupHint || "",
    hasRequiredHostPermission: Boolean(provider.requiredHostPermission),
    enabled: Boolean(provider.enabled),
    requestEnabled: Boolean(provider.requestEnabled),
    customEndpoint: provider.customEndpoint || false,
    customConfigured: Boolean(provider.customConfigured)
  }));
}

export function getProvider(id, customProvider = null) {
  if (id === CUSTOM_OPENAI_COMPATIBLE_PROVIDER_ID) return buildCustomProvider(customProvider);
  return PROVIDERS[id] || null;
}

export function hasProvider(id) {
  return Boolean(PROVIDERS[id]);
}

export function getDefaultProviderId() {
  return DEFAULT_PROVIDER_ID;
}

export function getDefaultModelForProvider(id, customProvider = null) {
  return getProvider(id, customProvider)?.defaultModel || getProvider(DEFAULT_PROVIDER_ID).defaultModel;
}

export function normalizeProviderId(id) {
  return hasProvider(id) ? id : DEFAULT_PROVIDER_ID;
}

export function sanitizeModelForProvider(providerId, model) {
  const fallback = getDefaultModelForProvider(providerId);
  if (typeof model !== "string") return fallback;
  const trimmed = model.trim();
  return trimmed ? trimmed.slice(0, 120) : fallback;
}

export function isRealRuntimeProvider(provider) {
  return Boolean(provider)
    && provider.protocol === "openai-compatible"
    && Boolean(provider.baseURL)
    && Boolean(provider.chatPath)
    && Boolean(provider.requiredHostPermission)
    && (provider.customEndpoint === false || provider.customEndpoint === "safe_openai_compatible");
}

export function isDefaultModel(model) {
  return listProviders().some((provider) => provider.defaultModel === model);
}
