"use strict";

const {
  DEFAULT_RESPONSE,
  isAllowedEmotion,
  isAllowedMotion,
  isAllowedBubbleType
} = require("./llmSchemas");

function stripCodeFence(text) {
  const trimmed = String(text || "").trim();
  const match = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return match ? match[1].trim() : trimmed;
}

function previewText(value, maxLength = 600) {
  const text = String(value || "");
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}... [truncated ${text.length - maxLength} chars]`;
}

function findJsonObject(text) {
  const source = String(text || "");
  let start = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];

    if (start === -1) {
      if (char === "{") {
        start = index;
        depth = 1;
      }
      continue;
    }

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === "\\") {
      escaped = true;
      continue;
    }

    if (char === "\"") {
      inString = !inString;
      continue;
    }

    if (inString) continue;

    if (char === "{") depth += 1;
    if (char === "}") depth -= 1;

    if (depth === 0) return source.slice(start, index + 1);
  }

  return "";
}

function parseObject(rawText, warnings) {
  if (rawText && typeof rawText === "object" && !Array.isArray(rawText)) {
    return { object: rawText, parseResult: "object_input" };
  }

  const text = stripCodeFence(rawText);
  if (!text) {
    warnings.push("Model output was empty.");
    return { object: null, parseResult: "empty_output" };
  }

  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return { object: parsed, parseResult: "parsed_direct_json" };
    }
    warnings.push("Model JSON was not an object.");
    return { object: null, parseResult: "json_not_object" };
  } catch {
    const candidate = findJsonObject(text);
    if (!candidate) {
      warnings.push("No JSON object found in model output.");
      return { object: null, parseResult: "no_json_object" };
    }

    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return {
          object: parsed,
          parseResult: "parsed_extracted_json",
          extractedJsonPreview: previewText(candidate)
        };
      }
      warnings.push("Extracted JSON was not an object.");
      return {
        object: null,
        parseResult: "extracted_json_not_object",
        extractedJsonPreview: previewText(candidate)
      };
    } catch {
      warnings.push("Extracted JSON object could not be parsed.");
      return {
        object: null,
        parseResult: "extracted_json_parse_failed",
        extractedJsonPreview: previewText(candidate)
      };
    }
  }
}

function normalizeConfidence(value, warnings) {
  if (value === undefined || value === null || value === "") {
    warnings.push("Missing confidence; defaulted to 0.7.");
    return 0.7;
  }

  const number = Number(value);
  if (!Number.isFinite(number)) {
    warnings.push("Invalid confidence; defaulted to 0.7.");
    return 0.7;
  }

  if (number < 0 || number > 1) warnings.push("Confidence clamped to [0, 1].");
  return Math.max(0, Math.min(1, number));
}

function normalizeModelResponse(rawText, options = {}) {
  const warnings = [];
  const parsedResult = parseObject(rawText, warnings);
  const parsed = parsedResult.object;
  let fallbackUsed = !parsed;
  const source = parsed || {
    reply: DEFAULT_RESPONSE.reply,
    emotion: "neutral",
    motion: "idle",
    bubble_type: "error",
    confidence: 0.3
  };

  const reply = typeof source.reply === "string" ? source.reply.trim() : "";
  const response = {
    reply: reply || DEFAULT_RESPONSE.reply,
    emotion: typeof source.emotion === "string" ? source.emotion.trim() : DEFAULT_RESPONSE.emotion,
    motion: typeof source.motion === "string" ? source.motion.trim() : DEFAULT_RESPONSE.motion,
    bubble_type: typeof source.bubble_type === "string" ? source.bubble_type.trim() : DEFAULT_RESPONSE.bubble_type,
    confidence: normalizeConfidence(source.confidence, warnings)
  };

  if (!reply) {
    warnings.push("Empty reply; used model failure message.");
    fallbackUsed = true;
    response.emotion = "neutral";
    response.motion = "idle";
    response.bubble_type = "error";
    response.confidence = 0.3;
  }

  if (!isAllowedEmotion(response.emotion)) {
    warnings.push(`Invalid emotion "${response.emotion}"; defaulted to neutral.`);
    response.emotion = "neutral";
  }

  if (!isAllowedMotion(response.motion)) {
    warnings.push(`Invalid motion "${response.motion}"; defaulted to idle.`);
    response.motion = "idle";
  }

  if (!isAllowedBubbleType(response.bubble_type)) {
    warnings.push(`Invalid bubble_type "${response.bubble_type}"; defaulted to normal.`);
    response.bubble_type = "normal";
  }

  response.debug = {
    warnings,
    fallbackUsed,
    parseResult: parsedResult.parseResult,
    extractedJsonPreview: parsedResult.extractedJsonPreview,
    parsedObject: options.includeParsedObject ? parsed : undefined,
    rawTextAvailable: typeof rawText === "string" && rawText.length > 0
  };

  if (options.includeRawText) response.debug.rawText = typeof rawText === "string" ? rawText : JSON.stringify(rawText);

  return response;
}

module.exports = {
  normalizeModelResponse,
  findJsonObject
};
