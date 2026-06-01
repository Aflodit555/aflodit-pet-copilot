"use strict";

const AFloditCommandRegistry = (() => {
  const builtin = typeof AFloditBuiltinCommands !== "undefined"
    ? AFloditBuiltinCommands
    : require("./builtinCommands");
  const parser = typeof AFloditCommandParser !== "undefined"
    ? AFloditCommandParser
    : require("./commandParser");
  const schema = typeof AFloditCommandSchema !== "undefined"
    ? AFloditCommandSchema
    : require("./commandSchema");

  function validateCommands(commands = []) {
    const errors = [];
    const aliases = new Map();
    const normalizedCommands = commands.map(schema.normalizeCommand);

    for (const command of normalizedCommands) {
      const shape = schema.validateCommandShape(command);
      if (!shape.valid) errors.push(...shape.errors);

      for (const alias of command.aliases) {
        const normalizedAlias = schema.normalizeAlias(alias);
        if (!normalizedAlias) continue;
        if (aliases.has(normalizedAlias)) {
          errors.push(`Duplicate command alias "${normalizedAlias}" used by "${aliases.get(normalizedAlias)}" and "${command.id}".`);
        } else {
          aliases.set(normalizedAlias, command.id);
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      commands: normalizedCommands
    };
  }

  function createCommandRegistry(commands = builtin.BUILTIN_COMMANDS) {
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
        return parser.parseCommandInput(input, registeredCommands);
      },

      extractChatContextDirectives(input) {
        return parser.extractChatContextDirectives(input, registeredCommands);
      },

      validateCommands(candidateCommands = registeredCommands) {
        return validateCommands(candidateCommands);
      }
    });
  }

  const defaultRegistry = createCommandRegistry(builtin.BUILTIN_COMMANDS);

  function listCommands() {
    return defaultRegistry.listCommands();
  }

  function findCommand(input) {
    return defaultRegistry.findCommand(input);
  }

  function extractChatContextDirectives(input) {
    return defaultRegistry.extractChatContextDirectives(input);
  }

  return {
    createCommandRegistry,
    validateCommands,
    listCommands,
    findCommand,
    extractChatContextDirectives
  };
})();

if (typeof module !== "undefined" && module.exports) {
  module.exports = AFloditCommandRegistry;
}
