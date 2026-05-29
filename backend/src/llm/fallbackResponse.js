"use strict";

const { ACTIONS } = require("./llmSchemas");

const FALLBACKS = Object.freeze({
  missingSelectedExplain: Object.freeze({
    reply: "请先选中需要解释的网页文本。",
    emotion: "error",
    motion: "idle",
    bubble_type: "warning",
    confidence: 0.4
  }),
  missingSelectedTranslate: Object.freeze({
    reply: "请先选中需要翻译的网页文本。",
    emotion: "error",
    motion: "idle",
    bubble_type: "warning",
    confidence: 0.4
  }),
  missingPageSummary: Object.freeze({
    reply: "当前页面内容不足，无法可靠总结。",
    emotion: "confused",
    motion: "idle",
    bubble_type: "warning",
    confidence: 0.4
  }),
  modelFailure: Object.freeze({
    reply: "模型暂时没有返回有效结果，请稍后再试。",
    emotion: "neutral",
    motion: "idle",
    bubble_type: "error",
    confidence: 0.3
  })
});

function cloneResponse(response) {
  return { ...response };
}

function getInputFallback(input) {
  const hasSelectedText = Boolean(input.selectedText && input.selectedText.trim());
  const hasPageText = Boolean(input.pageTextSnippet && input.pageTextSnippet.trim());

  if (input.action === ACTIONS.EXPLAIN_SELECTION && !hasSelectedText) {
    return cloneResponse(FALLBACKS.missingSelectedExplain);
  }

  if (input.action === ACTIONS.TRANSLATE && !hasSelectedText) {
    return cloneResponse(FALLBACKS.missingSelectedTranslate);
  }

  if (input.action === ACTIONS.SUMMARIZE_PAGE && !hasPageText) {
    return cloneResponse(FALLBACKS.missingPageSummary);
  }

  return null;
}

function modelFailureResponse() {
  return cloneResponse(FALLBACKS.modelFailure);
}

module.exports = {
  FALLBACKS,
  getInputFallback,
  modelFailureResponse
};
