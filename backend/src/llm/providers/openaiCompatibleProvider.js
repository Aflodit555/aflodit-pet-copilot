"use strict";

function trimTrailingSlashes(value) {
  return String(value || "").trim().replace(/\/+$/g, "");
}

function buildChatCompletionsUrl(baseUrl) {
  const clean = trimTrailingSlashes(baseUrl);
  if (!clean) return "";
  if (/\/chat\/completions$/i.test(clean)) return clean;
  return `${clean}/chat/completions`;
}

function numberFromEnv(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function callOpenAICompatibleProvider({ prompts, env = process.env }) {
  const baseUrl = buildChatCompletionsUrl(env.MODEL_BASE_URL);
  const apiKey = String(env.MODEL_API_KEY || "").trim();
  const model = String(env.MODEL_NAME || "").trim();
  const timeoutMs = numberFromEnv(env.MODEL_TIMEOUT_MS, 20000);
  const temperature = numberFromEnv(env.MODEL_TEMPERATURE, 0.3);
  const maxTokens = numberFromEnv(env.MODEL_MAX_TOKENS, 512);

  if (!baseUrl) throw new Error("MODEL_BASE_URL is required for openai-compatible provider.");
  if (!apiKey) throw new Error("MODEL_API_KEY is required for openai-compatible provider.");
  if (!model) throw new Error("MODEL_NAME is required for openai-compatible provider.");

  const response = await fetchWithTimeout(baseUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: prompts.systemPrompt },
        { role: "user", content: prompts.userPrompt }
      ],
      temperature,
      max_tokens: maxTokens
    })
  }, timeoutMs);

  const rawResponse = await response.text();
  if (!response.ok) {
    throw new Error(`OpenAI-compatible provider returned HTTP ${response.status}.`);
  }

  let data;
  try {
    data = JSON.parse(rawResponse);
  } catch {
    throw new Error("OpenAI-compatible provider returned non-JSON response.");
  }

  const rawText = data?.choices?.[0]?.message?.content;
  if (typeof rawText !== "string") throw new Error("OpenAI-compatible response did not include choices[0].message.content.");

  return {
    provider: "openai-compatible",
    model,
    rawText
  };
}

module.exports = {
  callOpenAICompatibleProvider,
  buildChatCompletionsUrl
};
