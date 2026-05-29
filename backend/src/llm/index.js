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

function previewText(value, maxLength = 500) {
  const text = String(value || "");
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}... [truncated ${text.length - maxLength} chars]`;
}

function previewInput(input) {
  return {
    action: input.action,
    userText: previewText(input.userText),
    selectedText: previewText(input.selectedText),
    pageTitle: previewText(input.pageTitle, 200),
    pageUrl: previewText(input.pageUrl, 300),
    pageTextSnippet: previewText(input.pageTextSnippet),
    characterState: previewText(input.characterState, 200)
  };
}

function previewPrompts(prompts) {
  return {
    systemPrompt: previewText(prompts.systemPrompt, 1200),
    userPrompt: previewText(prompts.userPrompt, 1200)
  };
}

function safeFinalResponse(response) {
  return {
    reply: previewText(response.reply),
    emotion: response.emotion,
    motion: response.motion,
    bubble_type: response.bubble_type,
    confidence: response.confidence,
    debug: response.debug ? {
      provider: response.debug.provider,
      model: response.debug.model,
      action: response.debug.action,
      warnings: response.debug.warnings,
      fallbackUsed: response.debug.fallbackUsed,
      parseResult: response.debug.parseResult,
      rawTextAvailable: response.debug.rawTextAvailable,
      timing: response.debug.timing,
      metrics: response.debug.metrics
    } : undefined
  };
}

function getConfiguredModel(provider, env) {
  const configured = String(env.MODEL_NAME || "").trim();
  return configured || (provider === "mock" ? "mock" : "");
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
      parseResult: response.debug?.parseResult,
      extractedJsonPreview: response.debug?.extractedJsonPreview,
      rawTextAvailable: Boolean(response.debug?.rawTextAvailable),
      timing: debug.timing,
      metrics: debug.metrics
    }
  };

  if (includeRawText && rawModelText) publicResponse.debug.rawModelText = rawModelText;
  return publicResponse;
}

async function runPetLlm(body, options = {}) {
  const totalStartedAt = Date.now();
  const env = options.env || process.env;
  const includeDebug = options.includeDebug ?? true;
  const includeRawText = toBool(env.LLM_DEBUG, false);
  const llmDebug = toBool(env.LLM_DEBUG, false);
  const logger = options.logger || console;
  const inputStartedAt = Date.now();
  const { input, debug: inputDebug } = normalizeInput(body);
  const inputNormalizeMs = Date.now() - inputStartedAt;
  const provider = getProviderName(env);

  const debug = {
    provider,
    model: getConfiguredModel(provider, env),
    action: input.action,
    inputLengths: inputDebug.inputLengths,
    truncation: inputDebug.truncation,
    warnings: [...inputDebug.warnings],
    providerWarnings: [],
    fallbackUsed: false,
    timing: {
      inputNormalizeMs
    },
    metrics: {
      inputLengths: inputDebug.inputLengths
    }
  };

  if (llmDebug) {
    logger.log("[LLM_DEBUG] normalized request", JSON.stringify({
      input: previewInput(input),
      lengths: inputDebug.inputLengths,
      truncation: inputDebug.truncation,
      warnings: inputDebug.warnings
    }, null, 2));
  }

  const fallbackStartedAt = Date.now();
  const inputFallback = getInputFallback(input);
  if (inputFallback) {
    debug.timing.fallbackMs = Date.now() - fallbackStartedAt;
    debug.fallbackUsed = true;
    debug.warnings.push("Input fallback returned before provider call.");
    const response = { ...inputFallback, debug: { warnings: [], fallbackUsed: true, rawTextAvailable: false } };
    debug.timing.totalMs = Date.now() - totalStartedAt;
    const finalResponse = includeDebug ? attachDebug(response, debug, includeRawText) : inputFallback;
    if (llmDebug) {
      logger.log("[LLM_DEBUG] input fallback", JSON.stringify({
        reason: "required input missing",
        action: input.action,
        finalResponse: safeFinalResponse(finalResponse)
      }, null, 2));
    }
    return finalResponse;
  }

  debug.timing.fallbackMs = Date.now() - fallbackStartedAt;
  const promptStartedAt = Date.now();
  const prompts = buildPrompt(input);
  debug.timing.promptBuildMs = Date.now() - promptStartedAt;
  debug.metrics.systemPromptChars = prompts.systemPrompt.length;
  debug.metrics.userPromptChars = prompts.userPrompt.length;

  if (llmDebug) {
    logger.log("[LLM_DEBUG] prompt payload preview", JSON.stringify({
      ...previewPrompts(prompts),
      systemPromptChars: debug.metrics.systemPromptChars,
      userPromptChars: debug.metrics.userPromptChars
    }, null, 2));
  }

  let providerStartedAt = null;
  try {
    providerStartedAt = Date.now();
    const modelResult = await callModel({ input, prompts, env });
    debug.provider = modelResult.provider;
    debug.model = modelResult.model;
    debug.timing.providerRoundTripMs = modelResult.timing?.providerRoundTripMs ?? (Date.now() - providerStartedAt);
    debug.timing.providerReadBodyMs = modelResult.timing?.providerReadBodyMs;
    debug.metrics.rawModelTextChars = String(modelResult.rawText || "").length;
    if (llmDebug) {
      logger.log("[LLM_DEBUG] raw model response", JSON.stringify({
        provider: modelResult.provider,
        model: modelResult.model,
        rawTextPreview: previewText(modelResult.rawText, 1200),
        rawTextLength: String(modelResult.rawText || "").length
      }, null, 2));
    }
    const normalizeStartedAt = Date.now();
    const normalized = normalizeModelResponse(modelResult.rawText, {
      includeRawText,
      includeParsedObject: llmDebug
    });
    debug.timing.responseNormalizeMs = Date.now() - normalizeStartedAt;
    debug.timing.totalMs = Date.now() - totalStartedAt;
    const finalResponse = includeDebug ? attachDebug(normalized, debug, includeRawText) : {
      reply: normalized.reply,
      emotion: normalized.emotion,
      motion: normalized.motion,
      bubble_type: normalized.bubble_type,
      confidence: normalized.confidence
    };
    if (llmDebug) {
      logger.log("[LLM_DEBUG] parse and normalization", JSON.stringify({
        parseResult: normalized.debug?.parseResult,
        warnings: normalized.debug?.warnings,
        fallbackUsed: normalized.debug?.fallbackUsed,
        parsedObject: normalized.debug?.parsedObject,
        extractedJsonPreview: normalized.debug?.extractedJsonPreview
      }, null, 2));
      logger.log("[LLM_DEBUG] timing", JSON.stringify(debug.timing, null, 2));
      logger.log("[LLM_DEBUG] final response", JSON.stringify(safeFinalResponse(finalResponse), null, 2));
    }
    return finalResponse;
  } catch (error) {
    if (providerStartedAt !== null && debug.timing.providerRoundTripMs === undefined) {
      debug.timing.providerRoundTripMs = Date.now() - providerStartedAt;
    }
    debug.fallbackUsed = true;
    debug.providerWarnings.push(error?.message || "Provider call failed.");
    const fallback = {
      ...modelFailureResponse(),
      debug: { warnings: [], fallbackUsed: true, rawTextAvailable: false }
    };
    debug.timing.totalMs = Date.now() - totalStartedAt;
    const finalResponse = includeDebug ? attachDebug(fallback, debug, includeRawText) : modelFailureResponse();
    if (llmDebug) {
      logger.log("[LLM_DEBUG] model runtime error", JSON.stringify({
        provider: debug.provider,
        model: debug.model,
        reason: error?.message || "Provider call failed.",
        finalResponse: safeFinalResponse(finalResponse)
      }, null, 2));
      logger.log("[LLM_DEBUG] timing", JSON.stringify(debug.timing, null, 2));
    }
    return finalResponse;
  }
}

module.exports = {
  runPetLlm,
  normalizeInput,
  buildPrompt,
  normalizeModelResponse
};
