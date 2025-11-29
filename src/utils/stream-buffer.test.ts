import { describe, test, expect } from "bun:test";
import { StreamBuffer } from "./stream-buffer";

describe("StreamBuffer", () => {
  test("passes through normal text immediately", async () => {
    let output = "";
    const buffer = new StreamBuffer((text) => {
      output += text;
    });

    await buffer.write("Hello world");
    expect(output).toBe("Hello world");
  });

  test("buffers and highlights code block", async () => {
    let output = "";
    const buffer = new StreamBuffer((text) => {
      output += text;
    });

    await buffer.write("```javascript\n");
    await buffer.write("const x = 1;\n");
    await buffer.write("```\n");

    // Output should contain highlighted code (with ANSI codes)
    expect(output).toContain("const");
    expect(output).toContain("x");
    // Should NOT contain fence markers
    expect(output).not.toContain("```");
  });

  test("handles chunks split across fence boundaries", async () => {
    let output = "";
    const buffer = new StreamBuffer((text) => {
      output += text;
    });

    await buffer.write("```java");
    await buffer.write("script\n");
    await buffer.write("const x = 1;\n");
    await buffer.write("```");
    await buffer.write("\n");

    expect(output).toContain("const");
    expect(output).not.toContain("```");
  });

  test("handles multiple code blocks", async () => {
    let output = "";
    const buffer = new StreamBuffer((text) => {
      output += text;
    });

    await buffer.write("Text before\n");
    await buffer.write("```python\n");
    await buffer.write("x = 1\n");
    await buffer.write("```\n");
    await buffer.write("Text between\n");
    await buffer.write("```typescript\n");
    await buffer.write("const y = 2;\n");
    await buffer.write("```\n");

    expect(output).toContain("Text before");
    expect(output).toContain("Text between");
    expect(output).toContain("x");
    expect(output).toContain("y");
  });

  test("handles code block with no language", async () => {
    let output = "";
    const buffer = new StreamBuffer((text) => {
      output += text;
    });

    await buffer.write("```\n");
    await buffer.write("plain text\n");
    await buffer.write("```\n");

    expect(output).toContain("plain text");
    expect(output).not.toContain("```");
  });

  test("flushes unclosed code block with highlighting", async () => {
    let output = "";
    const buffer = new StreamBuffer((text) => {
      output += text;
    });

    await buffer.write("```javascript\n");
    await buffer.write("const x = 1;\n");
    // No closing fence
    await buffer.flush();

    // Should still contain the code content
    expect(output).toContain("const");
    expect(output).toContain("x");
    // Should be highlighted (with ANSI codes)
    expect(output).toContain("\x1b[");
  });

  test("ignores inline backticks", async () => {
    let output = "";
    const buffer = new StreamBuffer((text) => {
      output += text;
    });

    await buffer.write("This has `inline code` in it.\n");

    expect(output).toBe("This has `inline code` in it.\n");
  });

  test("handles backticks split across multiple chunks", async () => {
    let output = "";
    const buffer = new StreamBuffer((text) => {
      output += text;
    });

    await buffer.write("Here is some code:\n");
    await buffer.write("``");
    await buffer.write("`typescript\n");
    await buffer.write("const x = 1;\n");
    await buffer.write("```\n");
    await buffer.write("End of code.");
    await buffer.flush();

    expect(output).toContain("Here is some code:");
    expect(output).toContain("const");
    expect(output).toContain("End of code.");
    // Should contain ANSI codes (highlighting)
    expect(output).toContain("\x1b[");
    // Should NOT contain fence markers
    expect(output).not.toContain("```");
  });
});
