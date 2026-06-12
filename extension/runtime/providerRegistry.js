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
    chatPath: "/v1/chat/completions",
    defaultModel: "gpt-4o-mini",
    enabled: true,
    requestEnabled: false,
    customEndpoint: false
  }),
  deepseek: Object.freeze({
    id: "deepseek",
    displayName: "DeepSeek",
    protocol: "openai-compatible",
    origin: "https://api.deepseek.com",
    chatPath: "/chat/completions",
    requiredHostPermission: "https://api.deepseek.com/*",
    defaultModel: "deepseek-chat",
    enabled: true,
    requestEnabled: false,
    customEndpoint: false
  }),
  dashscope: Object.freeze({
    id: "dashscope",
    displayName: "Qwen / DashScope",
    protocol: "openai-compatible",
    origin: "https://dashscope.aliyuncs.com",
    chatPath: "/compatible-mode/v1/chat/completions",
    defaultModel: "qwen-plus",
    enabled: true,
    requestEnabled: false,
    customEndpoint: false
  }),
  openrouter: Object.freeze({
    id: "openrouter",
    displayName: "OpenRouter",
    protocol: "openai-compatible",
    origin: "https://openrouter.ai",
    chatPath: "/api/v1/chat/completions",
    defaultModel: "openai/gpt-4o-mini",
    enabled: true,
    requestEnabled: false,
    customEndpoint: false
  })
});

const DEFAULT_PROVIDER_ID = "mock";

export function listProviders() {
  return Object.values(PROVIDERS);
}

export function listPublicProviders() {
  return listProviders().map((provider) => ({
    id: provider.id,
    displayName: provider.displayName,
    protocol: provider.protocol,
    defaultModel: provider.defaultModel,
    enabled: Boolean(provider.enabled),
    requestEnabled: Boolean(provider.requestEnabled)
  }));
}

export function getProvider(id) {
  return PROVIDERS[id] || null;
}

export function hasProvider(id) {
  return Boolean(getProvider(id));
}

export function getDefaultProviderId() {
  return DEFAULT_PROVIDER_ID;
}

export function getDefaultModelForProvider(id) {
  return getProvider(id)?.defaultModel || getProvider(DEFAULT_PROVIDER_ID).defaultModel;
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

export function isDefaultModel(model) {
  return listProviders().some((provider) => provider.defaultModel === model);
}
