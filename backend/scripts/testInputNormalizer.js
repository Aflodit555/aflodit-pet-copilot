"use strict";

const assert = require("assert");
const { normalizeInput } = require("../src/llm/inputNormalizer");

function test(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

test("normalizes snake_case payload to camelCase internals", () => {
  const { input } = normalizeInput({
    action: "chat",
    user_text: " hello ",
    selected_text: " selected ",
    page_title: " title ",
    page_url: " https://example.com ",
    page_text_snippet: " page ",
    character_state: " idle "
  });

  assert.deepStrictEqual(input, {
    action: "chat",
    userText: "hello",
    selectedText: "selected",
    pageTitle: "title",
    pageUrl: "https://example.com",
    pageTextSnippet: "page",
    characterState: "idle"
  });
});

test("accepts action aliases at boundary", () => {
  assert.strictEqual(normalizeInput({ action: "explain" }).input.action, "explain_selection");
  assert.strictEqual(normalizeInput({ action: "summarizePage" }).input.action, "summarize_page");
  assert.strictEqual(normalizeInput({ action: "translate_selection" }).input.action, "translate");
});

test("invalid action defaults to chat with warning", () => {
  const { input, debug } = normalizeInput({ action: "bad_action" });
  assert.strictEqual(input.action, "chat");
  assert.ok(debug.warnings.some((warning) => warning.includes("Invalid action")));
});

test("non-string values become empty strings", () => {
  const { input } = normalizeInput({
    user_text: 123,
    selected_text: ["x"],
    page_text_snippet: { text: "x" }
  });
  assert.strictEqual(input.userText, "");
  assert.strictEqual(input.selectedText, "");
  assert.strictEqual(input.pageTextSnippet, "");
});

test("overlong selected_text truncates", () => {
  const { input, debug } = normalizeInput({ selected_text: "a".repeat(3100) });
  assert.strictEqual(input.selectedText.length, 3000);
  assert.strictEqual(debug.fields.selected_text.truncated, true);
});

test("overlong page_text_snippet truncates", () => {
  const { input, debug } = normalizeInput({ page_text_snippet: "b".repeat(6100) });
  assert.strictEqual(input.pageTextSnippet.length, 6000);
  assert.strictEqual(debug.fields.page_text_snippet.truncated, true);
});
