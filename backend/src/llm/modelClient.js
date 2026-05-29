"use strict";

const { callMockProvider } = require("./providers/mockProvider");
const { callMockProviderStream } = require("./providers/mockProvider");
const {
  callOpenAICompatibleProvider,
  callOpenAICompatibleProviderStream
} = require("./providers/openaiCompatibleProvider");

function getProviderName(env = process.env) {
  return String(env.MODEL_PROVIDER || "mock").trim().toLowerCase();
}

async function callModel({ input, prompts, env = process.env }) {
  const provider = getProviderName(env);

  if (provider === "mock") {
    return callMockProvider({ input, prompts, env });
  }

  if (provider === "openai-compatible" || provider === "openai_compatible" || provider === "openai") {
    return callOpenAICompatibleProvider({ input, prompts, env });
  }

  throw new Error(`Unsupported MODEL_PROVIDER "${provider}".`);
}

async function callModelStream({ input, prompts, env = process.env, onDelta }) {
  const provider = getProviderName(env);

  if (provider === "mock") {
    return callMockProviderStream({ input, prompts, env, onDelta });
  }

  if (provider === "openai-compatible" || provider === "openai_compatible" || provider === "openai") {
    return callOpenAICompatibleProviderStream({ input, prompts, env, onDelta });
  }

  throw new Error(`Unsupported MODEL_PROVIDER "${provider}".`);
}

module.exports = {
  getProviderName,
  callModel,
  callModelStream
};
