"use strict";

const AFLODIT_FIXED_TIMEOUT_MS = 40000;

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

function makeProviderError(code, message, details = {}) {
  const error = new Error(message);
  error.code = code;
  Object.assign(error, details);
  return error;
}

async function callOpenAICompatibleProvider({ prompts, env = process.env }) {
  const baseUrl = buildChatCompletionsUrl(env.MODEL_BASE_URL);
  const apiKey = String(env.MODEL_API_KEY || "").trim();
  const model = String(env.MODEL_NAME || "").trim();
  const timeoutMs = AFLODIT_FIXED_TIMEOUT_MS;
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

async function callOpenAICompatibleProviderStream({ prompts, env = process.env, onDelta }) {
  const baseUrl = buildChatCompletionsUrl(env.MODEL_BASE_URL);
  const apiKey = String(env.MODEL_API_KEY || "").trim();
  const model = String(env.MODEL_NAME || "").trim();
  const timeoutMs = AFLODIT_FIXED_TIMEOUT_MS;
  const temperature = numberFromEnv(env.MODEL_TEMPERATURE, 0.3);
  const maxTokens = numberFromEnv(env.MODEL_MAX_TOKENS, 512);

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
    max_tokens: maxTokens,
    stream: true
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const streamStartedAt = Date.now();
  let response;
  let firstDeltaAt = null;
  let deltaCount = 0;
  let text = "";

  try {
    response = await fetch(baseUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal
    });

    if (!response.ok) {
      await response.text().catch(() => "");
      throw new Error(`OpenAI-compatible provider returned HTTP ${response.status}.`);
    }

    if (!response.body) throw new Error("OpenAI-compatible provider did not return a readable stream.");

    const decoder = new TextDecoder();
    const reader = response.body.getReader();
    let buffer = "";
    let done = false;

    while (!done) {
      const read = await reader.read();
      done = read.done;
      buffer += decoder.decode(read.value || new Uint8Array(), { stream: !done });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || "";

      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line || line.startsWith(":")) continue;
        if (!line.startsWith("data:")) continue;

        const payload = line.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;

        let chunk;
        try {
          chunk = JSON.parse(payload);
        } catch {
          throw new Error("OpenAI-compatible provider returned malformed stream JSON.");
        }

        const delta = chunk?.choices?.[0]?.delta?.content;
        if (typeof delta !== "string" || !delta) continue;

        if (firstDeltaAt === null) firstDeltaAt = Date.now();
        deltaCount += 1;
        text += delta;
        onDelta?.(delta);
      }
    }
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error(`Provider stream timed out after ${timeoutMs} ms.`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }

  return {
    provider: "openai-compatible",
    model,
    text,
    deltaCount,
    timing: {
      providerStreamMs: Date.now() - streamStartedAt,
      timeToFirstDeltaMs: firstDeltaAt === null ? undefined : firstDeltaAt - streamStartedAt
    },
    request: {
      responseFormat: "reply_text_stream"
    }
  };
}

async function testOpenAICompatibleProvider({ settings }) {
  const modelSettings = settings?.model || {};
  const baseUrl = buildChatCompletionsUrl(modelSettings.baseUrl);
  const apiKey = String(modelSettings.apiKey || "").trim();
  const model = String(modelSettings.model || "").trim();
  const timeoutMs = AFLODIT_FIXED_TIMEOUT_MS;

  if (!baseUrl || !apiKey || !model) {
    throw makeProviderError("MODEL_CONFIG_INVALID", "Missing openai-compatible settings.");
  }

  const requestBody = {
    model,
    messages: [{ role: "user", content: "ping" }],
    temperature: 0,
    max_tokens: 1
  };

  const startedAt = Date.now();
  let response;
  try {
    response = await fetchWithTimeout(baseUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(requestBody)
    }, timeoutMs);
  } catch (error) {
    if (/timed out/i.test(error?.message || "")) {
      throw makeProviderError("MODEL_TIMEOUT", "Provider request timed out.", { latencyMs: Date.now() - startedAt });
    }
    throw makeProviderError("MODEL_NETWORK_ERROR", "Provider network request failed.", { latencyMs: Date.now() - startedAt });
  }

  const latencyMs = Date.now() - startedAt;
  const rawResponse = await response.text().catch(() => "");

  if (response.status === 401 || response.status === 403) {
    throw makeProviderError("MODEL_AUTH_FAILED", "Provider authentication failed.", { latencyMs });
  }
  if (!response.ok) {
    throw makeProviderError("MODEL_BAD_RESPONSE", `Provider returned HTTP ${response.status}.`, { latencyMs });
  }

  let data;
  try {
    data = JSON.parse(rawResponse);
  } catch {
    throw makeProviderError("MODEL_BAD_RESPONSE", "Provider returned non-JSON response.", { latencyMs });
  }

  if (!Array.isArray(data?.choices)) {
    throw makeProviderError("MODEL_BAD_RESPONSE", "Provider response did not include choices.", { latencyMs });
  }

  return { ok: true, latencyMs };
}

module.exports = {
  callOpenAICompatibleProvider,
  callOpenAICompatibleProviderStream,
  buildChatCompletionsUrl,
  testOpenAICompatibleProvider
};
