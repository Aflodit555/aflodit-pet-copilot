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
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error(`Provider request timed out after ${timeoutMs} ms.`);
    }
    throw error;
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
  const useJsonObjectResponseFormat = String(env.MODEL_RESPONSE_FORMAT || "").trim() === "json_object";

  if (!baseUrl) throw new Error("MODEL_BASE_URL is required for openai-compatible provider.");
  if (!apiKey) throw new Error("MODEL_API_KEY is required for openai-compatible provider.");
  if (!model) throw new Error("MODEL_NAME is required for openai-compatible provider.");

  const requestBody = {
    model,
    messages: [
      { role: "system", content: prompts.systemPrompt },
      { role: "user", content: prompts.userPrompt }
    ],
    temperature,
    max_tokens: maxTokens
  };

  if (useJsonObjectResponseFormat) {
    requestBody.response_format = { type: "json_object" };
  }

  const fetchStartedAt = Date.now();
  const response = await fetchWithTimeout(baseUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(requestBody)
  }, timeoutMs);
  const providerRoundTripMs = Date.now() - fetchStartedAt;

  const readStartedAt = Date.now();
  const rawResponse = await response.text();
  const providerReadBodyMs = Date.now() - readStartedAt;

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
    rawText,
    timing: {
      providerRoundTripMs,
      providerReadBodyMs
    },
    request: {
      responseFormat: useJsonObjectResponseFormat ? "json_object" : ""
    }
  };
}

module.exports = {
  callOpenAICompatibleProvider,
  buildChatCompletionsUrl
};
