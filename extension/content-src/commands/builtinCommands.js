"use strict";

const AFloditBuiltinCommands = (() => {
  const SELECTION_CONTEXT_COMMAND = Object.freeze({
    id: "selection-context",
    aliases: Object.freeze(["@选区", "@selection"]),
    description: "Include the current selected text in the next chat request.",
    inputMode: "chat",
    contextMode: "selection",
    handler: Object.freeze({
      type: "chat_context",
      action: "include_selection"
    }),
    enabled: true
  });

  const PAGE_CONTEXT_COMMAND = Object.freeze({
    id: "page-context",
    aliases: Object.freeze(["@页面", "@page"]),
    description: "Include the current readable page text in the next chat request.",
    inputMode: "chat",
    contextMode: "page",
    handler: Object.freeze({
      type: "chat_context",
      action: "include_page"
    }),
    enabled: true
  });

  const READING_COMMAND = Object.freeze({
    id: "reading",
    aliases: Object.freeze(["@陪读", "@reading", "@read"]),
    description: "Enter the local reading companion mode.",
    inputMode: "local",
    contextMode: "none",
    handler: Object.freeze({
      type: "local_action",
      action: "enter_reading"
    }),
    enabled: true
  });

  const EXIT_READING_COMMAND = Object.freeze({
    id: "exit-reading",
    aliases: Object.freeze(["@退出陪读", "@exit_reading", "@normal"]),
    description: "Exit the local reading companion mode.",
    inputMode: "local",
    contextMode: "none",
    handler: Object.freeze({
      type: "local_action",
      action: "exit_reading"
    }),
    enabled: true
  });

  const POMODORO_COMMAND = Object.freeze({
    id: "pomodoro",
    aliases: Object.freeze(["@番茄钟", "@pomodoro"]),
    description: "Open the local Pomodoro Focus Ring settings panel.",
    inputMode: "local",
    contextMode: "none",
    handler: Object.freeze({
      type: "local_action",
      action: "open_pomodoro"
    }),
    enabled: true
  });

  const STOP_POMODORO_COMMAND = Object.freeze({
    id: "stop-pomodoro",
    aliases: Object.freeze(["@停止番茄钟", "@stop_pomodoro"]),
    description: "Stop the current local Pomodoro timer.",
    inputMode: "local",
    contextMode: "none",
    handler: Object.freeze({
      type: "local_action",
      action: "stop_pomodoro"
    }),
    enabled: true
  });

  const POMODORO_STATUS_COMMAND = Object.freeze({
    id: "pomodoro-status",
    aliases: Object.freeze(["@番茄钟状态", "@pomodoro_status"]),
    description: "Show the current local Pomodoro timer status.",
    inputMode: "local",
    contextMode: "none",
    handler: Object.freeze({
      type: "local_action",
      action: "pomodoro_status"
    }),
    enabled: true
  });

  const BUILTIN_COMMANDS = Object.freeze([
    SELECTION_CONTEXT_COMMAND,
    PAGE_CONTEXT_COMMAND,
    READING_COMMAND,
    EXIT_READING_COMMAND,
    POMODORO_COMMAND,
    STOP_POMODORO_COMMAND,
    POMODORO_STATUS_COMMAND
  ]);

  return {
    BUILTIN_COMMANDS,
    SELECTION_CONTEXT_COMMAND,
    PAGE_CONTEXT_COMMAND,
    READING_COMMAND,
    EXIT_READING_COMMAND,
    POMODORO_COMMAND,
    STOP_POMODORO_COMMAND,
    POMODORO_STATUS_COMMAND
  };
})();

if (typeof module !== "undefined" && module.exports) {
  module.exports = AFloditBuiltinCommands;
}
