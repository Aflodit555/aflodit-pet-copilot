"use strict";

const { normalizeInput } = require("./inputNormalizer");
const { buildPrompt } = require("./promptBuilder");
const { callModel, getProviderName } = require("./modelClient");
const { normalizeModelResponse } = require("./responseNormalizer");
const { getInputFallback, modelFailureResponse } = require("./fallbackResponse");

function toBool(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  return ["1", "true", "yes", "on"].includes(String(value).trim().toLowerCase());
}

function attachDebug(response, debug, includeRawText) {
  const rawModelText = response.debug?.rawText;
  const runtimeWarnings = [
    ...(debug.warnings || []),
    ...(debug.providerWarnings || []),
    ...(response.debug?.warnings || [])
  ];

  const publicResponse = {
    reply: response.reply,
    emotion: response.emotion,
    motion: response.motion,
    bubble_type: response.bubble_type,
    confidence: response.confidence,
    debug: {
      provider: debug.provider,
      model: debug.model,
      action: debug.action,
      inputLengths: debug.inputLengths,
      truncation: debug.truncation,
      warnings: runtimeWarnings,
      fallbackUsed: Boolean(debug.fallbackUsed || response.debug?.fallbackUsed),
      rawTextAvailable: Boolean(response.debug?.rawTextAvailable)
    }
  };

  if (includeRawText && rawModelText) publicResponse.debug.rawModelText = rawModelText;
  return publicResponse;
}

async function runPetLlm(body, options = {}) {
  const env = options.env || process.env;
  const includeDebug = options.includeDebug ?? true;
  const includeRawText = toBool(env.LLM_DEBUG, false);
  const { input, debug: inputDebug } = normalizeInput(body);

  const debug = {
    provider: getProviderName(env),
    model: "mock",
    action: input.action,
    inputLengths: inputDebug.inputLengths,
    truncation: inputDebug.truncation,
    warnings: [...inputDebug.warnings],
    providerWarnings: [],
    fallbackUsed: false
  };

  const inputFallback = getInputFallback(input);
  if (inputFallback) {
    debug.fallbackUsed = true;
    debug.warnings.push("Input fallback returned before provider call.");
    const response = { ...inputFallback, debug: { warnings: [], fallbackUsed: true, rawTextAvailable: false } };
    return includeDebug ? attachDebug(response, debug, includeRawText) : inputFallback;
  }

  const prompts = buildPrompt(input);

  try {
    const modelResult = await callModel({ input, prompts, env });
    debug.provider = modelResult.provider;
    debug.model = modelResult.model;
    const normalized = normalizeModelResponse(modelResult.rawText, { includeRawText });
    return includeDebug ? attachDebug(normalized, debug, includeRawText) : {
      reply: normalized.reply,
      emotion: normalized.emotion,
      motion: normalized.motion,
      bubble_type: normalized.bubble_type,
      confidence: normalized.confidence
    };
  } catch (error) {
    debug.fallbackUsed = true;
    debug.providerWarnings.push(error?.message || "Provider call failed.");
    const fallback = {
      ...modelFailureResponse(),
      debug: { warnings: [], fallbackUsed: true, rawTextAvailable: false }
    };
    return includeDebug ? attachDebug(fallback, debug, includeRawText) : modelFailureResponse();
  }
}

module.exports = {
  runPetLlm,
  normalizeInput,
  buildPrompt,
  normalizeModelResponse
};
