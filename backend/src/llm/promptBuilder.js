"use strict";

const { ACTIONS, EMOTIONS, MOTIONS, BUBBLE_TYPES } = require("./llmSchemas");

function jsonBlock(input) {
  return JSON.stringify({
    action: input.action,
    user_text: input.userText,
    selected_text: input.selectedText,
    page_title: input.pageTitle,
    page_url: input.pageUrl,
    page_text_snippet: input.pageTextSnippet,
    character_state: input.characterState
  }, null, 2);
}

const ACTION_INSTRUCTIONS = Object.freeze({
  [ACTIONS.CHAT]: "Answer user_text. Use selected_text or page_text_snippet only when they are non-empty; do not pretend page content was read when it is absent.",
  [ACTIONS.EXPLAIN_SELECTION]: "Explain selected_text in concise Simplified Chinese. Focus on meaning, key points, and necessary background. Do not repeat the full original text.",
  [ACTIONS.SUMMARIZE_PAGE]: "Summarize page_text_snippet in concise Simplified Chinese. Prioritize topic, key points, and conclusion.",
  [ACTIONS.TRANSLATE]: "Translate or polish selected_text into natural Simplified Chinese. If it is already Chinese, start with: 原文已经是中文。润色后： Do not explain the translation process."
});

function buildPrompt(input) {
  const actionInstruction = ACTION_INSTRUCTIONS[input.action] || ACTION_INSTRUCTIONS[ACTIONS.CHAT];
  const systemPrompt = [
    "You are AFlodit Pet Copilot's response module.",
    "Return one JSON object only. No Markdown.",
    "Fields: reply, emotion, motion, bubble_type, confidence.",
    `Preferred emotion: ${EMOTIONS.join("/")}.`,
    `Preferred motion: ${MOTIONS.join("/")}.`,
    `Preferred bubble_type: ${BUBBLE_TYPES.join("/")}.`,
    actionInstruction
  ].join("\n");

  const userPrompt = [
    "Process this sanitized browser-extension request.",
    "Input:",
    jsonBlock(input)
  ].join("\n");

  return { systemPrompt, userPrompt };
}

module.exports = {
  buildPrompt
};
