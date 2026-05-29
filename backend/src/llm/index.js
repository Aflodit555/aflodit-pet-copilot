"use strict";

const { normalizeInput } = require("./inputNormalizer");
const { buildPrompt, buildStreamingPrompt } = require("./promptBuilder");
const { callModel, callModelStream, getProviderName } = require("./modelClient");
const { normalizeModelResponse } = require("./responseNormalizer");
const { getInputFallback, modelFailureResponse } = require("./fallbackResponse");
const { ACTIONS } = require("./llmSchemas");

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

function streamDefaultsForAction(action, reply) {
  if (action === ACTIONS.CHAT) {
    const looksHappy = /[!！]|谢谢|太好了|great|nice|happy/i.test(reply);
    return {
      emotion: looksHappy ? "happy" : "neutral",
      motion: looksHappy ? "nod" : "idle",
      bubble_type: "normal",
      confidence: 0.75
    };
  }

  if ([ACTIONS.TRANSLATE, ACTIONS.EXPLAIN_SELECTION, ACTIONS.SUMMARIZE_PAGE].includes(action)) {
    return {
      emotion: "thinking",
      motion: "think",
      bubble_type: "info",
      confidence: 0.75
    };
  }

  return {
    emotion: "neutral",
    motion: "idle",
    bubble_type: "normal",
    confidence: 0.7
  };
}

function splitEventDebug(response, includeDebug) {
  const { debug, ...data } = response;
  return includeDebug && debug ? { data, debug } : { data };
}

function normalizeFinalObject(finalObject, includeRawText, llmDebug) {
  return normalizeModelResponse(JSON.stringify(finalObject), {
    includeRawText,
    includeParsedObject: llmDebug
  });
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

async function runPetLlmStream(body, options = {}) {
  const totalStartedAt = Date.now();
  const env = options.env || process.env;
  const includeDebug = options.includeDebug ?? false;
  const includeRawText = toBool(env.LLM_DEBUG, false);
  const llmDebug = toBool(env.LLM_DEBUG, false);
  const logger = options.logger || console;
  const emit = typeof options.onEvent === "function" ? options.onEvent : () => {};
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
      inputLengths: inputDebug.inputLengths,
      deltaCount: 0,
      replyChars: 0
    }
  };

  emit({ type: "start", action: input.action });

  if (llmDebug) {
    logger.log("[LLM_DEBUG] stream normalized request", JSON.stringify({
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
    debug.warnings.push("Input fallback returned before streaming provider call.");
    const normalizeStartedAt = Date.now();
    const normalized = normalizeFinalObject(inputFallback, includeRawText, llmDebug);
    debug.timing.finalNormalizeMs = Date.now() - normalizeStartedAt;
    debug.timing.streamTotalMs = Date.now() - totalStartedAt;
    debug.timing.totalMs = debug.timing.streamTotalMs;
    debug.metrics.replyChars = normalized.reply.length;
    const finalResponse = includeDebug ? attachDebug(normalized, debug, includeRawText) : {
      reply: normalized.reply,
      emotion: normalized.emotion,
      motion: normalized.motion,
      bubble_type: normalized.bubble_type,
      confidence: normalized.confidence
    };
    emit({ type: "final", ...splitEventDebug(finalResponse, includeDebug) });
    return finalResponse;
  }

  debug.timing.fallbackMs = Date.now() - fallbackStartedAt;
  const promptStartedAt = Date.now();
  const prompts = buildStreamingPrompt(input);
  debug.timing.promptBuildMs = Date.now() - promptStartedAt;
  debug.metrics.systemPromptChars = prompts.systemPrompt.length;
  debug.metrics.userPromptChars = prompts.userPrompt.length;

  if (llmDebug) {
    logger.log("[LLM_DEBUG] stream prompt payload preview", JSON.stringify({
      ...previewPrompts(prompts),
      systemPromptChars: debug.metrics.systemPromptChars,
      userPromptChars: debug.metrics.userPromptChars
    }, null, 2));
  }

  let accumulatedText = "";
  const streamStartedAt = Date.now();

  try {
    const modelResult = await callModelStream({
      input,
      prompts,
      env,
      onDelta(text) {
        const delta = String(text || "");
        if (!delta) return;
        if (debug.metrics.deltaCount === 0) {
          debug.timing.timeToFirstDeltaMs = Date.now() - streamStartedAt;
        }
        debug.metrics.deltaCount += 1;
        accumulatedText += delta;
        emit({ type: "delta", text: delta });
      }
    });

    debug.provider = modelResult.provider;
    debug.model = modelResult.model;
    debug.timing.providerStreamMs = modelResult.timing?.providerStreamMs ?? (Date.now() - streamStartedAt);
    debug.timing.timeToFirstDeltaMs = debug.timing.timeToFirstDeltaMs ?? modelResult.timing?.timeToFirstDeltaMs;
    if (!accumulatedText && modelResult.text) accumulatedText = modelResult.text;
    debug.metrics.deltaCount = modelResult.deltaCount ?? debug.metrics.deltaCount;

    const reply = accumulatedText.trim();
    const defaults = streamDefaultsForAction(input.action, reply);
    const finalObject = {
      reply: reply || modelFailureResponse().reply,
      ...defaults,
      confidence: reply ? defaults.confidence : 0.3,
      ...(reply ? {} : { emotion: "error", motion: "shake", bubble_type: "error" })
    };

    const normalizeStartedAt = Date.now();
    const normalized = normalizeFinalObject(finalObject, includeRawText, llmDebug);
    debug.timing.finalNormalizeMs = Date.now() - normalizeStartedAt;
    debug.timing.streamTotalMs = Date.now() - totalStartedAt;
    debug.timing.totalMs = debug.timing.streamTotalMs;
    debug.metrics.replyChars = normalized.reply.length;

    const finalResponse = includeDebug ? attachDebug(normalized, debug, includeRawText) : {
      reply: normalized.reply,
      emotion: normalized.emotion,
      motion: normalized.motion,
      bubble_type: normalized.bubble_type,
      confidence: normalized.confidence
    };

    if (llmDebug) {
      logger.log("[LLM_DEBUG] stream timing", JSON.stringify(debug.timing, null, 2));
      logger.log("[LLM_DEBUG] stream metrics", JSON.stringify(debug.metrics, null, 2));
      logger.log("[LLM_DEBUG] stream final response", JSON.stringify(safeFinalResponse(finalResponse), null, 2));
    }

    emit({ type: "final", ...splitEventDebug(finalResponse, includeDebug) });
    return finalResponse;
  } catch (error) {
    debug.fallbackUsed = true;
    debug.providerWarnings.push(error?.message || "Provider stream failed.");
    const finalObject = {
      ...modelFailureResponse(),
      emotion: "error",
      motion: "shake",
      bubble_type: "error",
      confidence: 0.3
    };
    const normalizeStartedAt = Date.now();
    const normalized = normalizeFinalObject(finalObject, includeRawText, llmDebug);
    debug.timing.finalNormalizeMs = Date.now() - normalizeStartedAt;
    debug.timing.providerStreamMs = debug.timing.providerStreamMs ?? (Date.now() - streamStartedAt);
    debug.timing.streamTotalMs = Date.now() - totalStartedAt;
    debug.timing.totalMs = debug.timing.streamTotalMs;
    debug.metrics.replyChars = normalized.reply.length;
    const finalResponse = includeDebug ? attachDebug(normalized, debug, includeRawText) : {
      reply: normalized.reply,
      emotion: normalized.emotion,
      motion: normalized.motion,
      bubble_type: normalized.bubble_type,
      confidence: normalized.confidence
    };

    if (llmDebug) {
      logger.log("[LLM_DEBUG] stream runtime error", JSON.stringify({
        provider: debug.provider,
        model: debug.model,
        reason: error?.message || "Provider stream failed.",
        finalResponse: safeFinalResponse(finalResponse)
      }, null, 2));
      logger.log("[LLM_DEBUG] stream timing", JSON.stringify(debug.timing, null, 2));
    }

    emit({ type: "error", ...splitEventDebug(finalResponse, includeDebug) });
    return finalResponse;
  }
}

module.exports = {
  runPetLlm,
  runPetLlmStream,
  normalizeInput,
  buildPrompt,
  buildStreamingPrompt,
  normalizeModelResponse
};
