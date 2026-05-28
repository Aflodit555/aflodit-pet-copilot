"use strict";

const { normalizeAction } = require("./llmSchemas");
const { TEXT_LIMITS, sanitizeText } = require("./textLimits");

const FIELD_SOURCES = Object.freeze({
  action: ["action", "type"],
  user_text: ["user_text", "userText", "message"],
  selected_text: ["selected_text", "selectedText", "text"],
  page_title: ["page_title", "pageTitle", "title"],
  page_url: ["page_url", "pageUrl", "url"],
  page_text_snippet: ["page_text_snippet", "pageTextSnippet", "pageText"],
  character_state: ["character_state", "characterState"]
});

function firstField(body, names) {
  for (const name of names) {
    if (Object.prototype.hasOwnProperty.call(body, name)) return body[name];
  }
  return "";
}

function normalizeInput(body = {}) {
  const source = body && typeof body === "object" ? body : {};
  const warnings = [];
  const meta = {};

  const sanitized = {};
  for (const [field, names] of Object.entries(FIELD_SOURCES)) {
    const result = sanitizeText(firstField(source, names), TEXT_LIMITS[field]);
    sanitized[field] = result.value;
    meta[field] = result.meta;
  }

  const action = normalizeAction(sanitized.action, warnings);

  const input = {
    action,
    userText: sanitized.user_text,
    selectedText: sanitized.selected_text,
    pageTitle: sanitized.page_title,
    pageUrl: sanitized.page_url,
    pageTextSnippet: sanitized.page_text_snippet,
    characterState: sanitized.character_state
  };

  return {
    input,
    debug: {
      warnings,
      fields: meta,
      inputLengths: {
        userText: input.userText.length,
        selectedText: input.selectedText.length,
        pageTitle: input.pageTitle.length,
        pageUrl: input.pageUrl.length,
        pageTextSnippet: input.pageTextSnippet.length,
        characterState: input.characterState.length
      },
      truncation: Object.fromEntries(
        Object.entries(meta).map(([field, fieldMeta]) => [field, fieldMeta.truncated])
      )
    }
  };
}

module.exports = {
  normalizeInput
};
