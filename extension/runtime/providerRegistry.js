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
    chatPath: "/chat/completions",
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
    chatPath: "/chat/completions",
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
    chatPath: "/chat/completions",
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
    chatPath: "/chat/completions",
    requiredHostPermission: "https://openrouter.ai/*",
    defaultModel: "openai/gpt-4o-mini",
    setupHint: "Use OpenRouter API Key. Model names are OpenRouter slugs.",
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
    setupHint: provider.setupHint || "",
    hasRequiredHostPermission: Boolean(provider.requiredHostPermission),
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

export function isRealRuntimeProvider(provider) {
  return Boolean(provider)
    && provider.protocol === "openai-compatible"
    && Boolean(provider.baseURL)
    && Boolean(provider.chatPath)
    && Boolean(provider.requiredHostPermission)
    && provider.customEndpoint === false;
}

export function isDefaultModel(model) {
  return listProviders().some((provider) => provider.defaultModel === model);
}
