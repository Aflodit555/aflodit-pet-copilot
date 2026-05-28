"use strict";

const { callMockProvider } = require("./providers/mockProvider");
const { callOpenAICompatibleProvider } = require("./providers/openaiCompatibleProvider");

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

module.exports = {
  getProviderName,
  callModel
};
