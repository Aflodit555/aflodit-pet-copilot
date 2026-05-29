"use strict";

const { BUILTIN_COMMANDS } = require("./builtinCommands");
const { normalizeAlias, normalizeCommand, validateCommandShape } = require("./commandSchema");
const { parseCommandInput } = require("./commandParser");

function validateCommands(commands = []) {
  const errors = [];
  const aliases = new Map();
  const normalizedCommands = commands.map(normalizeCommand);

  for (const command of normalizedCommands) {
    const shape = validateCommandShape(command);
    if (!shape.valid) errors.push(...shape.errors);

    for (const alias of command.aliases) {
      const normalizedAlias = normalizeAlias(alias);
      if (!normalizedAlias) continue;
      if (aliases.has(normalizedAlias)) {
        errors.push(`Duplicate command alias "${normalizedAlias}" used by "${aliases.get(normalizedAlias)}" and "${command.name}".`);
      } else {
        aliases.set(normalizedAlias, command.name);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    commands: normalizedCommands
  };
}

function createCommandRegistry(commands = BUILTIN_COMMANDS) {
  const validation = validateCommands(commands);
  if (!validation.valid) {
    throw new Error(`Invalid command registry: ${validation.errors.join(" ")}`);
  }

  const registeredCommands = Object.freeze(validation.commands.map((command) => Object.freeze(command)));

  return Object.freeze({
    listCommands() {
      return registeredCommands.slice();
    },

    findCommand(input) {
      return parseCommandInput(input, registeredCommands);
    },

    validateCommands(candidateCommands = registeredCommands) {
      return validateCommands(candidateCommands);
    }
  });
}

const defaultRegistry = createCommandRegistry(BUILTIN_COMMANDS);

function listCommands() {
  return defaultRegistry.listCommands();
}

function findCommand(input) {
  return defaultRegistry.findCommand(input);
}

module.exports = {
  createCommandRegistry,
  validateCommands,
  listCommands,
  findCommand
};
