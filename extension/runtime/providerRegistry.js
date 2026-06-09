const PROVIDERS = Object.freeze({
  mock: Object.freeze({
    id: "mock",
    displayName: "Mock",
    origin: "extension-background",
    defaultModel: "mock-model",
    protocol: "local-mock"
  })
});

export function listProviders() {
  return Object.values(PROVIDERS);
}

export function getProvider(id) {
  return PROVIDERS[id] || null;
}

export function hasProvider(id) {
  return Boolean(getProvider(id));
}

// Phase 2+ can add provider descriptors here after permissions and secret handling
// are migrated. Phase 1 intentionally does not add OpenAI, DeepSeek, DashScope,
// OpenRouter, custom endpoint support, or host permissions.
