export function createSecretStore() {
  return {
    async hasSecret() {
      return false;
    },

    async getMaskedPreview() {
      return "";
    },

    async clearSecret() {
      return { ok: true, cleared: false };
    }

    // saveSecret is intentionally not exposed in Phase 1. API keys remain in the
    // existing local backend path until a later migration phase designs storage.
  };
}
