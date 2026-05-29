"use strict";

const { normalizeAlias } = require("./commandSchema");

function splitCommandInput(input) {
  const text = String(input || "").trim();
  if (!text) return { token: "", args: "", reason: "empty_input" };
  if (!text.startsWith("@")) return { token: "", args: text, reason: "not_command" };

  const [token = "", ...rest] = text.split(/\s+/);
  return {
    token: normalizeAlias(token),
    args: rest.join(" ").trim(),
    reason: token ? "command_token" : "unknown_command"
  };
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

  const command = commands.find((candidate) => {
    const aliases = Array.isArray(candidate.aliases) ? candidate.aliases : [];
    return aliases.map(normalizeAlias).includes(parsed.token);
  });

  if (!command) {
    return {
      matched: false,
      executable: false,
      command: null,
      args: parsed.args,
      reason: "unknown_command"
    };
  }

  const enabled = Boolean(command.enabled);
  return {
    matched: true,
    executable: enabled,
    command,
    args: parsed.args,
    reason: enabled ? "matched_alias" : "disabled_command"
  };
}

module.exports = {
  splitCommandInput,
  parseCommandInput
};
