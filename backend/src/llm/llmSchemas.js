"use strict";

const ACTIONS = Object.freeze({
  CHAT: "chat",
  EXPLAIN_SELECTION: "explain_selection",
  SUMMARIZE_PAGE: "summarize_page",
  TRANSLATE: "translate"
});

const ACTION_ALIASES = Object.freeze({
  chat: ACTIONS.CHAT,
  explain: ACTIONS.EXPLAIN_SELECTION,
  explain_selection: ACTIONS.EXPLAIN_SELECTION,
  explainSelection: ACTIONS.EXPLAIN_SELECTION,
  summarize: ACTIONS.SUMMARIZE_PAGE,
  summary: ACTIONS.SUMMARIZE_PAGE,
  summarize_page: ACTIONS.SUMMARIZE_PAGE,
  summarizePage: ACTIONS.SUMMARIZE_PAGE,
  translate: ACTIONS.TRANSLATE,
  translate_selection: ACTIONS.TRANSLATE
});

const EMOTIONS = Object.freeze(["neutral", "happy", "thinking", "confused", "error"]);
const MOTIONS = Object.freeze(["idle", "nod", "shake", "jump", "think"]);
const BUBBLE_TYPES = Object.freeze(["normal", "info", "warning", "error"]);

const DEFAULT_RESPONSE = Object.freeze({
  reply: "模型暂时没有返回有效结果。",
  emotion: "neutral",
  motion: "idle",
  bubble_type: "normal",
  confidence: 0.7
});

function normalizeAction(rawAction, warnings = []) {
  const key = String(rawAction || "").trim();

  if (!key) {
    warnings.push("Missing action; defaulted to chat.");
    return ACTIONS.CHAT;
  }

  if (ACTION_ALIASES[key]) {
    if (ACTION_ALIASES[key] !== key) warnings.push(`Action alias "${key}" normalized to "${ACTION_ALIASES[key]}".`);
    return ACTION_ALIASES[key];
  }

  warnings.push(`Invalid action "${key}"; defaulted to chat.`);
  return ACTIONS.CHAT;
}

function isAllowedEmotion(value) {
  return EMOTIONS.includes(value);
}

function isAllowedMotion(value) {
  return MOTIONS.includes(value);
}

function isAllowedBubbleType(value) {
  return BUBBLE_TYPES.includes(value);
}

module.exports = {
  ACTIONS,
  ACTION_ALIASES,
  EMOTIONS,
  MOTIONS,
  BUBBLE_TYPES,
  DEFAULT_RESPONSE,
  normalizeAction,
  isAllowedEmotion,
  isAllowedMotion,
  isAllowedBubbleType
};
