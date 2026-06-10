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

// Future phases can add provider descriptors here after permissions, secrets,
// and explicit allowlist UI are designed. Phase 3 remains mock-only.
