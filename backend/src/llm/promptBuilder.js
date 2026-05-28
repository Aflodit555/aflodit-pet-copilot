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

function buildPrompt(input) {
  const systemPrompt = [
    "You are the core processing module for AFlodit Pet Copilot, a browser pet assistant.",
    "Return JSON only. Do not use Markdown, code fences, or text outside the JSON object.",
    `Allowed actions: ${Object.values(ACTIONS).join(", ")}.`,
    `Allowed emotion values: ${EMOTIONS.join(", ")}.`,
    `Allowed motion values: ${MOTIONS.join(", ")}.`,
    `Allowed bubble_type values: ${BUBBLE_TYPES.join(", ")}.`,
    "selected_text is present if selected_text.trim() is non-empty. page_text_snippet is present if page_text_snippet.trim() is non-empty.",
    "If selected_text is present, never say the user needs to select text.",
    "If page_text_snippet is present, never say page content is unavailable.",
    "For chat, answer user_text and use selected/page context only when provided.",
    "For explain_selection, explain selected_text concisely in Simplified Chinese without repeating the full original text.",
    "For summarize_page, summarize page_text_snippet concisely in Simplified Chinese.",
    "For translate, translate or polish selected_text into natural Simplified Chinese. If already Chinese, start with: 原文已经是中文。润色后：",
    "Output schema: {\"reply\":\"string\",\"emotion\":\"neutral|happy|thinking|confused|error\",\"motion\":\"idle|nod|shake|jump|think\",\"bubble_type\":\"normal|info|warning|error\",\"confidence\":0.7}"
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
