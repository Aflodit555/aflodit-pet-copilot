"use strict";

const { ACTIONS } = require("../llmSchemas");

async function callMockProvider({ input }) {
  const responses = {
    [ACTIONS.CHAT]: {
      reply: "这是 mock 模型回复。当前后端链路正常。",
      emotion: "neutral",
      motion: "idle",
      bubble_type: "normal",
      confidence: 0.7
    },
    [ACTIONS.EXPLAIN_SELECTION]: {
      reply: "这是对选中文本的 mock 解释，用于验证解释链路。",
      emotion: "thinking",
      motion: "think",
      bubble_type: "info",
      confidence: 0.7
    },
    [ACTIONS.SUMMARIZE_PAGE]: {
      reply: "这是页面内容的 mock 总结，用于验证页面总结链路。",
      emotion: "thinking",
      motion: "think",
      bubble_type: "info",
      confidence: 0.7
    },
    [ACTIONS.TRANSLATE]: {
      reply: input.selectedText && /[\u4e00-\u9fff]/.test(input.selectedText) && !/[A-Za-z]/.test(input.selectedText)
        ? "原文已经是中文。润色后：这是选中文本的 mock 润色，用于验证翻译链路。"
        : "这是选中文本的 mock 翻译，用于验证翻译链路。",
      emotion: "neutral",
      motion: "nod",
      bubble_type: "normal",
      confidence: 0.7
    }
  };

  return {
    provider: "mock",
    model: "mock",
    rawText: JSON.stringify(responses[input.action] || responses[ACTIONS.CHAT])
  };
}

module.exports = {
  callMockProvider
};
