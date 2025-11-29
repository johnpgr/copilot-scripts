import { describe, test, expect } from "bun:test";
import * as Effect from "effect/Effect";
import { StreamBuffer } from "./stream-buffer";
import { SyntaxHighlighter } from "./syntax-highlighter";

describe("StreamBuffer", () => {
  const highlighter = SyntaxHighlighter.create();

  test("passes through normal text immediately", async () => {
    let output = "";
    const buffer = await Effect.runPromise(
      StreamBuffer.create((text) => { output += text; }, highlighter),
    );

    await Effect.runPromise(buffer.write("Hello world"));
    expect(output).toBe("Hello world");
  });

  test("buffers and highlights code block", async () => {
    let output = "";
    const buffer = await Effect.runPromise(
      StreamBuffer.create((text) => { output += text; }, highlighter),
    );

    await Effect.runPromise(buffer.write("```javascript\n"));
    await Effect.runPromise(buffer.write("const x = 1;\n"));
    await Effect.runPromise(buffer.write("```\n"));

    expect(output).toContain("const");
    expect(output).toContain("x");
    expect(output).not.toContain("```");
  });

  test("handles chunks split across fence boundaries", async () => {
    let output = "";
    const buffer = await Effect.runPromise(
      StreamBuffer.create((text) => { output += text; }, highlighter),
    );

    await Effect.runPromise(buffer.write("```java"));
    await Effect.runPromise(buffer.write("script\n"));
    await Effect.runPromise(buffer.write("const x = 1;\n"));
    await Effect.runPromise(buffer.write("```"));
    await Effect.runPromise(buffer.write("\n"));

    expect(output).toContain("const");
    expect(output).not.toContain("```");
  });

  test("handles multiple code blocks", async () => {
    let output = "";
    const buffer = await Effect.runPromise(
      StreamBuffer.create((text) => { output += text; }, highlighter),
    );

    await Effect.runPromise(buffer.write("Text before\n"));
    await Effect.runPromise(buffer.write("```python\n"));
    await Effect.runPromise(buffer.write("x = 1\n"));
    await Effect.runPromise(buffer.write("```\n"));
    await Effect.runPromise(buffer.write("Text between\n"));
    await Effect.runPromise(buffer.write("```typescript\n"));
    await Effect.runPromise(buffer.write("const y = 2;\n"));
    await Effect.runPromise(buffer.write("```\n"));

    expect(output).toContain("Text before");
    expect(output).toContain("Text between");
    expect(output).toContain("x");
    expect(output).toContain("y");
  });

  test("handles code block with no language", async () => {
    let output = "";
    const buffer = await Effect.runPromise(
      StreamBuffer.create((text) => { output += text; }, highlighter),
    );

    await Effect.runPromise(buffer.write("```\n"));
    await Effect.runPromise(buffer.write("plain text\n"));
    await Effect.runPromise(buffer.write("```\n"));

    expect(output).toContain("plain text");
    expect(output).not.toContain("```");
  });

  test("flushes unclosed code block with highlighting", async () => {
    let output = "";
    const buffer = await Effect.runPromise(
      StreamBuffer.create((text) => { output += text; }, highlighter),
    );

    await Effect.runPromise(buffer.write("```javascript\n"));
    await Effect.runPromise(buffer.write("const x = 1;\n"));
    await Effect.runPromise(buffer.flush());

    expect(output).toContain("const");
    expect(output).toContain("x");
    expect(output).toContain("\x1b[");
  });

  test("ignores inline backticks", async () => {
    let output = "";
    const buffer = await Effect.runPromise(
      StreamBuffer.create((text) => { output += text; }, highlighter),
    );

    await Effect.runPromise(buffer.write("This has `inline code` in it.\n"));

    expect(output).toBe("This has `inline code` in it.\n");
  });

  test("handles backticks split across multiple chunks", async () => {
    let output = "";
    const buffer = await Effect.runPromise(
      StreamBuffer.create((text) => { output += text; }, highlighter),
    );

    await Effect.runPromise(buffer.write("Here is some code:\n"));
    await Effect.runPromise(buffer.write("``"));
    await Effect.runPromise(buffer.write("`typescript\n"));
    await Effect.runPromise(buffer.write("const x = 1;\n"));
    await Effect.runPromise(buffer.write("```\n"));
    await Effect.runPromise(buffer.write("End of code."));
    await Effect.runPromise(buffer.flush());

    expect(output).toContain("Here is some code:");
    expect(output).toContain("const");
    expect(output).toContain("End of code.");
    expect(output).toContain("\x1b[");
    expect(output).not.toContain("```");
  });
});
