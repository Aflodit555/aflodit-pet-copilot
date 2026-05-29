"use strict";

const FUTURE_READING_COMMAND = Object.freeze({
  name: "reading",
  aliases: Object.freeze(["@陪读", "陪读", "@reading"]),
  description: "Future reading companion mode placeholder. Not implemented in v0.6.5.",
  requiresSelection: false,
  requiresPageContext: false,
  modeTransition: "reading",
  action: "enter_reading_mode",
  enabled: false
});

const BUILTIN_COMMANDS = Object.freeze([
  FUTURE_READING_COMMAND
]);

module.exports = {
  BUILTIN_COMMANDS,
  FUTURE_READING_COMMAND
};
