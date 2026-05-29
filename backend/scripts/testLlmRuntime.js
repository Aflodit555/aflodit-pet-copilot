"use strict";

const assert = require("assert");
const { runPetLlm, runPetLlmStream } = require("../src/llm");

const env = {
  MODEL_PROVIDER: "mock",
  LLM_DEBUG: "false"
};

async function test(name, fn) {
  try {
    await fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

function assertResponseShape(result) {
  assert.strictEqual(typeof result.reply, "string");
  assert.ok(result.reply.length > 0);
  assert.ok(["neutral", "happy", "thinking", "confused", "error"].includes(result.emotion));
  assert.ok(["idle", "nod", "shake", "jump", "think"].includes(result.motion));
  assert.ok(["normal", "info", "warning", "error"].includes(result.bubble_type));
  assert.strictEqual(typeof result.confidence, "number");
}

(async () => {
  await test("chat with user_text", async () => {
    const result = await runPetLlm({ action: "chat", user_text: "hello" }, { env });
    assertResponseShape(result);
    assert.strictEqual(result.reply, "这是 mock 模型回复。当前后端链路正常。");
  });

  await test("chat with selected_text context", async () => {
    const result = await runPetLlm({ action: "chat", user_text: "explain this", selected_text: "context" }, { env });
    assertResponseShape(result);
    assert.strictEqual(result.debug.action, "chat");
  });

  await test("normal public response can omit debug", async () => {
    const result = await runPetLlm({ action: "chat", user_text: "hello" }, { env, includeDebug: false });
    assertResponseShape(result);
    assert.strictEqual(Object.prototype.hasOwnProperty.call(result, "debug"), false);
  });

  await test("debug response remains available when requested", async () => {
    const result = await runPetLlm({ action: "chat", user_text: "hello" }, { env, includeDebug: true });
    assertResponseShape(result);
    assert.strictEqual(result.debug.action, "chat");
  });

  await test("chat with page_text_snippet context", async () => {
    const result = await runPetLlm({ action: "chat", user_text: "what is this page", page_text_snippet: "page context" }, { env });
    assertResponseShape(result);
    assert.strictEqual(result.debug.action, "chat");
  });

  await test("explain_selection with selected_text", async () => {
    const result = await runPetLlm({ action: "explain_selection", selected_text: "A selected sentence." }, { env });
    assertResponseShape(result);
    assert.strictEqual(result.emotion, "thinking");
  });

  await test("explain_selection with empty selected_text", async () => {
    const result = await runPetLlm({ action: "explain_selection", selected_text: "" }, { env });
    assert.strictEqual(result.reply, "请先选中需要解释的网页文本。");
    assert.strictEqual(result.confidence, 0.4);
  });

  await test("translate with English selected_text", async () => {
    const result = await runPetLlm({ action: "translate", selected_text: "Hello world" }, { env });
    assertResponseShape(result);
    assert.ok(result.reply.includes("mock 翻译"));
  });

  await test("translate with Chinese selected_text", async () => {
    const result = await runPetLlm({ action: "translate", selected_text: "这是一段中文" }, { env });
    assertResponseShape(result);
    assert.ok(result.reply.startsWith("原文已经是中文。润色后："));
  });

  await test("translate with empty selected_text", async () => {
    const result = await runPetLlm({ action: "translate", selected_text: "" }, { env });
    assert.strictEqual(result.reply, "请先选中需要翻译的网页文本。");
    assert.strictEqual(result.confidence, 0.4);
  });

  await test("summarize_page with page_text_snippet", async () => {
    const result = await runPetLlm({ action: "summarize_page", page_text_snippet: "Page body" }, { env });
    assertResponseShape(result);
    assert.ok(result.reply.includes("mock 总结"));
  });

  await test("summarize_page with empty page_text_snippet", async () => {
    const result = await runPetLlm({ action: "summarize_page", page_text_snippet: "" }, { env });
    assert.strictEqual(result.reply, "当前页面内容不足，无法可靠总结。");
    assert.strictEqual(result.confidence, 0.4);
  });

  await test("invalid action alias fallback", async () => {
    const result = await runPetLlm({ action: "summarize", page_text_snippet: "Page body" }, { env });
    assert.strictEqual(result.debug.action, "summarize_page");
    assert.ok(result.debug.warnings.some((warning) => warning.includes("Action alias")));
  });

  await test("provider failure returns safe fallback shape", async () => {
    const result = await runPetLlm(
      { action: "chat", user_text: "hello" },
      { env: { MODEL_PROVIDER: "unsupported-provider", LLM_DEBUG: "false" }, includeDebug: false }
    );
    assertResponseShape(result);
    assert.strictEqual(Object.prototype.hasOwnProperty.call(result, "debug"), false);
    assert.strictEqual(result.bubble_type, "error");
  });

  await test("mock streaming returns deltas and final object", async () => {
    const events = [];
    const result = await runPetLlmStream(
      { action: "chat", user_text: "hello" },
      { env, includeDebug: true, onEvent: (event) => events.push(event) }
    );

    assertResponseShape(result);
    assert.ok(events.some((event) => event.type === "start"));
    assert.ok(events.some((event) => event.type === "delta" && event.text));
    assert.ok(events.some((event) => event.type === "final" && event.data?.reply));
    assert.strictEqual(result.debug.metrics.deltaCount > 0, true);
    assert.strictEqual(result.debug.metrics.replyChars, result.reply.length);
  });

  await test("mock streaming can omit debug", async () => {
    const events = [];
    const result = await runPetLlmStream(
      { action: "chat", user_text: "hello" },
      { env, includeDebug: false, onEvent: (event) => events.push(event) }
    );

    assertResponseShape(result);
    assert.strictEqual(Object.prototype.hasOwnProperty.call(result, "debug"), false);
    assert.ok(events.some((event) => event.type === "delta" && event.text));
    assert.ok(events.some((event) => event.type === "final" && event.data?.reply && !event.debug));
  });
})();
