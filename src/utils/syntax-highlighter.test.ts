import { describe, test, expect } from "bun:test";
import * as Effect from "effect/Effect";
import { highlightCode, SyntaxHighlighter } from "./syntax-highlighter";

describe("syntax-highlighter", () => {
  const highlighter = SyntaxHighlighter.create();

  test("highlights JavaScript code", async () => {
    const code = "const x = 1;";
    const highlighted = await Effect.runPromise(highlighter.highlight(code, "javascript"));

    expect(highlighted).toContain("\x1b[");
    expect(highlighted).toContain("const");
    expect(highlighted).toContain("x");
  });

  test("normalizes language aliases", async () => {
    const code = "const x = 1;";
    const highlighted = await Effect.runPromise(highlighter.highlight(code, "js"));

    expect(highlighted).toContain("\x1b[");
    expect(highlighted).toContain("const");
  });

  test("falls back to plain text on invalid language", async () => {
    const code = "const x = 1;";
    const highlighted = await Effect.runPromise(highlighter.highlight(code, "invalidlang12345"));

    expect(highlighted).toBe(code);
  });

  test("warmup function initializes highlighter", async () => {
    await Effect.runPromise(highlighter.highlight("", "text"));

    const start = Date.now();
    await Effect.runPromise(highlighter.highlight("test", "text"));
    const duration = Date.now() - start;

    expect(duration).toBeLessThan(100);
  });

  test("handles empty code", async () => {
    const highlighted = await Effect.runPromise(highlighter.highlight("", "javascript"));
    expect(highlighted).toBe("");
  });

  test("handles multiline code", async () => {
    const code = `function test() {
  return 42;
}`;
    const highlighted = await Effect.runPromise(highlighter.highlight(code, "javascript"));

    expect(highlighted).toContain("function");
    expect(highlighted).toContain("return");
    expect(highlighted).toContain("\x1b[");
  });

  test("legacy highlightCode function works", async () => {
    const code = "const x = 1;";
    const highlighted = await highlightCode(code, "javascript");

    expect(highlighted).toContain("\x1b[");
    expect(highlighted).toContain("const");
  });
});
