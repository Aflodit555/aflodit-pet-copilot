"use strict";

const AFloditCommandParser = (() => {
  const schema = typeof AFloditCommandSchema !== "undefined"
    ? AFloditCommandSchema
    : require("./commandSchema");

  function splitCommandInput(input) {
    const text = String(input || "").trim();
    if (!text) return { token: "", args: "", reason: "empty_input" };
    if (!text.startsWith("@")) return { token: "", args: text, reason: "not_command" };

    const [token = "", ...rest] = text.split(/\s+/);
    return {
      token: schema.normalizeAlias(token),
      args: rest.join(" ").trim(),
      reason: token ? "command_token" : "unknown_command"
    };
  }

  function findByAlias(token, commands = []) {
    return commands.find((candidate) => {
      const aliases = Array.isArray(candidate.aliases) ? candidate.aliases : [];
      return aliases.map(schema.normalizeAlias).includes(token);
    }) || null;
  }

  function parseCommandInput(input, commands = []) {
    const parsed = splitCommandInput(input);

    if (parsed.reason === "empty_input" || parsed.reason === "not_command") {
      return {
        matched: false,
        executable: false,
        command: null,
        args: parsed.args,
        reason: parsed.reason
      };
    }

    const command = findByAlias(parsed.token, commands);
    if (!command) {
      return {
        matched: false,
        executable: false,
        command: null,
        args: parsed.args,
        reason: "unknown_command"
      };
    }

    const executable = Boolean(command.enabled);
    return {
      matched: true,
      executable,
      command,
      args: parsed.args,
      reason: executable ? "matched_alias" : "disabled_command"
    };
  }

  function extractChatContextDirectives(input, commands = []) {
    const tokens = String(input || "").trim().split(/\s+/).filter(Boolean);
    const context = {
      userText: "",
      useSelection: false,
      usePage: false,
      commands: []
    };

    const kept = [];
    for (const token of tokens) {
      if (!token.startsWith("@")) {
        kept.push(token);
        continue;
      }

      const command = findByAlias(schema.normalizeAlias(token), commands);
      if (!command || !command.enabled || command.handler?.type !== "chat_context") {
        kept.push(token);
        continue;
      }

      if (command.contextMode === "selection") context.useSelection = true;
      if (command.contextMode === "page") context.usePage = true;
      context.commands.push(command.id);
    }

    context.userText = kept.join(" ").trim();
    return context;
  }

  return {
    splitCommandInput,
    parseCommandInput,
    extractChatContextDirectives
  };
})();

if (typeof module !== "undefined" && module.exports) {
  module.exports = AFloditCommandParser;
}
