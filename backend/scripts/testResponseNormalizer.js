"use strict";

const assert = require("assert");
const { normalizeModelResponse } = require("../src/llm/responseNormalizer");

function withoutDebug(response) {
  const { debug, ...rest } = response;
  return rest;
}

function test(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

test("pure JSON object string", () => {
  const result = normalizeModelResponse(JSON.stringify({
    reply: "ok",
    emotion: "happy",
    motion: "jump",
    bubble_type: "info",
    confidence: 0.8
  }));
  assert.deepStrictEqual(withoutDebug(result), {
    reply: "ok",
    emotion: "happy",
    motion: "jump",
    bubble_type: "info",
    confidence: 0.8
  });
});

test("JSON inside Markdown code fence", () => {
  const result = normalizeModelResponse("```json\n{\"reply\":\"ok\",\"confidence\":0.6}\n```");
  assert.strictEqual(result.reply, "ok");
  assert.strictEqual(result.confidence, 0.6);
});

test("JSON with extra text before and after", () => {
  const result = normalizeModelResponse("prefix {\"reply\":\"ok\",\"emotion\":\"thinking\"} suffix");
  assert.strictEqual(result.reply, "ok");
  assert.strictEqual(result.emotion, "thinking");
});

test("missing confidence defaults to 0.7", () => {
  const result = normalizeModelResponse("{\"reply\":\"ok\"}");
  assert.strictEqual(result.confidence, 0.7);
});

test("invalid confidence defaults to 0.7", () => {
  const result = normalizeModelResponse("{\"reply\":\"ok\",\"confidence\":\"bad\"}");
  assert.strictEqual(result.confidence, 0.7);
});

test("confidence clamps to one", () => {
  const result = normalizeModelResponse("{\"reply\":\"ok\",\"confidence\":3}");
  assert.strictEqual(result.confidence, 1);
});

test("invalid emotion falls back to neutral", () => {
  const result = normalizeModelResponse("{\"reply\":\"ok\",\"emotion\":\"wild\"}");
  assert.strictEqual(result.emotion, "neutral");
});

test("invalid motion falls back to idle", () => {
  const result = normalizeModelResponse("{\"reply\":\"ok\",\"motion\":\"dance\"}");
  assert.strictEqual(result.motion, "idle");
});

test("invalid bubble_type falls back to normal", () => {
  const result = normalizeModelResponse("{\"reply\":\"ok\",\"bubble_type\":\"toast\"}");
  assert.strictEqual(result.bubble_type, "normal");
});

test("empty reply uses model failure fallback", () => {
  const result = normalizeModelResponse("{\"reply\":\"   \",\"confidence\":0.9}");
  assert.ok(result.reply.includes("请稍后再试"));
  assert.strictEqual(result.emotion, "neutral");
  assert.strictEqual(result.bubble_type, "error");
  assert.strictEqual(result.confidence, 0.3);
  assert.strictEqual(result.debug.fallbackUsed, true);
});

test("invalid model output uses model failure fallback", () => {
  const result = normalizeModelResponse("not json");
  assert.ok(result.reply.includes("请稍后再试"));
  assert.strictEqual(result.emotion, "neutral");
  assert.strictEqual(result.bubble_type, "error");
  assert.strictEqual(result.confidence, 0.3);
  assert.strictEqual(result.debug.fallbackUsed, true);
});
