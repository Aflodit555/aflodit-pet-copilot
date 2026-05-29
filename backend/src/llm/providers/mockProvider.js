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

function getMockStreamingReply(input) {
  const responses = {
    [ACTIONS.CHAT]: "Mock streaming reply is working. The local backend can send partial text before the final object.",
    [ACTIONS.EXPLAIN_SELECTION]: "这是 mock 流式解释：选中文本的核心含义会在这里用简洁中文说明。",
    [ACTIONS.SUMMARIZE_PAGE]: "这是 mock 流式总结：页面主题、关键点和结论会逐步返回。",
    [ACTIONS.TRANSLATE]: input.selectedText && /[\u4e00-\u9fff]/.test(input.selectedText) && !/[A-Za-z]/.test(input.selectedText)
      ? "原文已经是中文。润色后：这是 mock 流式中文润色结果。"
      : "这是 mock 流式翻译：选中的英文内容会被翻译成自然的简体中文。"
  };

  return responses[input.action] || responses[ACTIONS.CHAT];
}

async function callMockProviderStream({ input, onDelta }) {
  const reply = getMockStreamingReply(input);
  const chunkSize = 8;
  const streamStartedAt = Date.now();
  let deltaCount = 0;

  for (let index = 0; index < reply.length; index += chunkSize) {
    const text = reply.slice(index, index + chunkSize);
    deltaCount += 1;
    await Promise.resolve();
    onDelta?.(text);
  }

  return {
    provider: "mock",
    model: "mock",
    text: reply,
    deltaCount,
    timing: {
      providerStreamMs: Date.now() - streamStartedAt
    }
  };
}

module.exports = {
  callMockProvider,
  callMockProviderStream
};
