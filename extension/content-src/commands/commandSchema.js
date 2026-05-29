"use strict";

const COMMAND_NAME_PATTERN = /^[a-z][a-z0-9_-]*$/i;

const DEFAULT_COMMAND = Object.freeze({
  name: "",
  aliases: Object.freeze([]),
  description: "",
  requiresSelection: false,
  requiresPageContext: false,
  modeTransition: "",
  action: "",
  enabled: false
});

function normalizeAlias(alias) {
  return String(alias || "").trim().toLowerCase();
}

function normalizeCommand(command = {}) {
  return {
    ...DEFAULT_COMMAND,
    ...command,
    name: String(command.name || "").trim(),
    aliases: Array.isArray(command.aliases) ? command.aliases.map(normalizeAlias).filter(Boolean) : [],
    description: String(command.description || "").trim(),
    requiresSelection: Boolean(command.requiresSelection),
    requiresPageContext: Boolean(command.requiresPageContext),
    modeTransition: String(command.modeTransition || "").trim(),
    action: String(command.action || "").trim(),
    enabled: Boolean(command.enabled)
  };
}

function validateCommandShape(command) {
  const normalized = normalizeCommand(command);
  const errors = [];

  if (!normalized.name || !COMMAND_NAME_PATTERN.test(normalized.name)) {
    errors.push("Command name must be a non-empty identifier.");
  }

  if (normalized.aliases.length === 0) {
    errors.push(`Command "${normalized.name || "(missing)"}" must define at least one alias.`);
  }

  if (!normalized.description) {
    errors.push(`Command "${normalized.name || "(missing)"}" must include a description.`);
  }

  if (!normalized.action) {
    errors.push(`Command "${normalized.name || "(missing)"}" must include an action.`);
  }

  return {
    command: normalized,
    valid: errors.length === 0,
    errors
  };
}

module.exports = {
  DEFAULT_COMMAND,
  normalizeAlias,
  normalizeCommand,
  validateCommandShape
};
