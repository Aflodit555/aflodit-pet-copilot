"use strict";

const assert = require("assert");
const { parseCommandInput } = require("./commandParser");
const { createCommandRegistry, validateCommands } = require("./commandRegistry");
const { BUILTIN_COMMANDS } = require("./builtinCommands");

function test(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

const enabledCommands = [
  {
    name: "sample",
    aliases: ["@sample", "@样例"],
    description: "Sample enabled command for parser tests.",
    action: "sample_action",
    enabled: true
  }
];

test("normal chat text is not treated as command", () => {
  const result = parseCommandInput("hello @sample", enabledCommands);
  assert.strictEqual(result.matched, false);
  assert.strictEqual(result.reason, "not_command");
  assert.strictEqual(result.args, "hello @sample");
});

test("empty input is not treated as command", () => {
  const result = parseCommandInput("   ", enabledCommands);
  assert.strictEqual(result.matched, false);
  assert.strictEqual(result.reason, "empty_input");
});

test("unknown at command is handled safely", () => {
  const result = parseCommandInput("  @unknown arg text  ", enabledCommands);
  assert.strictEqual(result.matched, false);
  assert.strictEqual(result.command, null);
  assert.strictEqual(result.args, "arg text");
  assert.strictEqual(result.reason, "unknown_command");
});

test("alias matching works", () => {
  const result = parseCommandInput("@sample arg text", enabledCommands);
  assert.strictEqual(result.matched, true);
  assert.strictEqual(result.executable, true);
  assert.strictEqual(result.command.name, "sample");
  assert.strictEqual(result.args, "arg text");
  assert.strictEqual(result.reason, "matched_alias");
});

test("Chinese alias matching works", () => {
  const result = parseCommandInput("@样例 参数", enabledCommands);
  assert.strictEqual(result.matched, true);
  assert.strictEqual(result.executable, true);
  assert.strictEqual(result.args, "参数");
});

test("disabled builtin command is not executable", () => {
  const registry = createCommandRegistry(BUILTIN_COMMANDS);
  const result = registry.findCommand("@陪读");
  assert.strictEqual(result.matched, true);
  assert.strictEqual(result.executable, false);
  assert.strictEqual(result.reason, "disabled_command");
});

test("duplicate aliases are detected by validation", () => {
  const result = validateCommands([
    {
      name: "one",
      aliases: ["@same"],
      description: "First command.",
      action: "one_action",
      enabled: true
    },
    {
      name: "two",
      aliases: ["@same"],
      description: "Second command.",
      action: "two_action",
      enabled: true
    }
  ]);

  assert.strictEqual(result.valid, false);
  assert.ok(result.errors.some((error) => error.includes("Duplicate command alias")));
});
