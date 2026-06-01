"use strict";

const AFloditCommandSchema = (() => {
  const COMMAND_ID_PATTERN = /^[a-z][a-z0-9_-]*$/i;
  const INPUT_MODES = Object.freeze(["chat", "local", "none"]);
  const CONTEXT_MODES = Object.freeze(["none", "selection", "page"]);

  const DEFAULT_COMMAND = Object.freeze({
    id: "",
    aliases: Object.freeze([]),
    description: "",
    inputMode: "chat",
    contextMode: "none",
    handler: Object.freeze({
      type: "",
      action: ""
    }),
    enabled: false
  });

  function normalizeAlias(alias) {
    return String(alias || "").trim().toLowerCase();
  }

  function normalizeHandler(handler = {}) {
    return {
      type: String(handler.type || "").trim(),
      action: String(handler.action || "").trim()
    };
  }

  function normalizeCommand(command = {}) {
    const inputMode = String(command.inputMode || DEFAULT_COMMAND.inputMode).trim();
    const contextMode = String(command.contextMode || DEFAULT_COMMAND.contextMode).trim();

    return {
      ...DEFAULT_COMMAND,
      ...command,
      id: String(command.id || "").trim(),
      aliases: Array.isArray(command.aliases) ? command.aliases.map(normalizeAlias).filter(Boolean) : [],
      description: String(command.description || "").trim(),
      inputMode: INPUT_MODES.includes(inputMode) ? inputMode : DEFAULT_COMMAND.inputMode,
      contextMode: CONTEXT_MODES.includes(contextMode) ? contextMode : DEFAULT_COMMAND.contextMode,
      handler: normalizeHandler(command.handler),
      enabled: Boolean(command.enabled)
    };
  }

  function validateCommandShape(command) {
    const normalized = normalizeCommand(command);
    const errors = [];

    if (!normalized.id || !COMMAND_ID_PATTERN.test(normalized.id)) {
      errors.push("Command id must be a non-empty identifier.");
    }

    if (normalized.aliases.length === 0) {
      errors.push(`Command "${normalized.id || "(missing)"}" must define at least one alias.`);
    }

    if (!normalized.description) {
      errors.push(`Command "${normalized.id || "(missing)"}" must include a description.`);
    }

    if (!normalized.handler.type || !normalized.handler.action) {
      errors.push(`Command "${normalized.id || "(missing)"}" must include handler type and action.`);
    }

    return {
      command: normalized,
      valid: errors.length === 0,
      errors
    };
  }

  return {
    DEFAULT_COMMAND,
    INPUT_MODES,
    CONTEXT_MODES,
    normalizeAlias,
    normalizeCommand,
    validateCommandShape
  };
})();

if (typeof module !== "undefined" && module.exports) {
  module.exports = AFloditCommandSchema;
}
