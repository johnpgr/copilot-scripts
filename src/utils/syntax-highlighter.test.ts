import { describe, test, expect } from "bun:test";
import { highlightCode, warmupHighlighter } from "./syntax-highlighter";

describe("syntax-highlighter", () => {
  test("highlights JavaScript code", async () => {
    const code = "const x = 1;";
    const highlighted = await highlightCode(code, "javascript");

    // Should contain ANSI escape codes
    expect(highlighted).toContain("\x1b[");
    // Should contain the code
    expect(highlighted).toContain("const");
    expect(highlighted).toContain("x");
  });

  test("normalizes language aliases", async () => {
    const code = "const x = 1;";

    // js should normalize to javascript
    const highlighted = await highlightCode(code, "js");
    expect(highlighted).toContain("\x1b[");
    expect(highlighted).toContain("const");
  });

  test("falls back to plain text on invalid language", async () => {
    const code = "const x = 1;";
    const highlighted = await highlightCode(code, "invalidlang12345");

    // Should return unhighlighted code on error
    expect(highlighted).toBe(code);
  });

  test("warmup function initializes highlighter", async () => {
    await warmupHighlighter();

    // Subsequent highlight should be fast (already initialized)
    const start = Date.now();
    await highlightCode("test", "text");
    const duration = Date.now() - start;

    // Should be < 50ms if already warmed up
    expect(duration).toBeLessThan(100);
  });

  test("handles empty code", async () => {
    const highlighted = await highlightCode("", "javascript");
    expect(highlighted).toBe("");
  });

  test("handles multiline code", async () => {
    const code = `function test() {
  return 42;
}`;
    const highlighted = await highlightCode(code, "javascript");

    expect(highlighted).toContain("function");
    expect(highlighted).toContain("return");
    expect(highlighted).toContain("\x1b[");
  });
});
