"use strict";

const TEXT_LIMITS = Object.freeze({
  action: 80,
  user_text: 1200,
  selected_text: 3000,
  page_title: 200,
  page_url: 500,
  page_text_snippet: 6000,
  character_state: 1000
});

function toSafeString(value) {
  return typeof value === "string" ? value : "";
}

function normalizeWhitespace(value) {
  return value.replace(/[ \t\f\v]+/g, " ").replace(/\r\n?/g, "\n").trim();
}

function sanitizeText(value, limit) {
  const raw = toSafeString(value);
  const originalLength = raw.length;
  const normalized = normalizeWhitespace(raw);
  const truncated = normalized.length > limit;
  const finalValue = truncated ? normalized.slice(0, limit) : normalized;

  return {
    value: finalValue,
    meta: {
      originalLength,
      finalLength: finalValue.length,
      truncated,
      limit
    }
  };
}

module.exports = {
  TEXT_LIMITS,
  sanitizeText
};
