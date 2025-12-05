#!/usr/bin/env bun
import path from "path";
import * as Effect from "effect/Effect";
import { CopilotChatInstance } from "../core/chat-instance.ts";
import { ModelResolver } from "../core/model-resolver.ts";
import { CopilotService } from "../services/CopilotService.ts";
import { FileSystem } from "../services/FileSystemService.ts";
import { RuntimeServices } from "../runtime.ts";

const SYSTEM_PROMPT = `You fill EXACTLY ONE placeholder inside a user-provided file.

The user will send you a complete file with a single {:FILL_HERE:} marker.

Rules:
- Inspect the surrounding text to understand context
- Preserve indentation, spacing, and code style
- Output ONLY the replacement text (no explanations)
- Wrap your output in <COMPLETION>...</COMPLETION> tags
- Do not include the marker itself in your response

Example:
User sends: function test() {\\n  {:FILL_HERE:}\\n}
You respond: <COMPLETION>return 42;</COMPLETION>`;

async function main() {
  const filePath = process.argv[2];
  const miniPath = process.argv[3] || "";
  const modelSpec = process.argv[4] || "g";

  if (!filePath) {
    console.error("Usage: holefill <file> [<mini_file>] [<model>]");
    process.exit(1);
  }

  const services = RuntimeServices.create();
  const resolver = await Effect.runPromise(
    ModelResolver.make(services.copilot, services.fs),
  );
  const model = await Effect.runPromise(resolver.resolve(modelSpec));
  const fs = services.fs;
  const copilot: CopilotService = services.copilot;

  let fileCode = await Effect.runPromise(fs.readFile(filePath));
  let miniCode = miniPath
    ? await Effect.runPromise(fs.readFile(miniPath))
    : fileCode;

  if (!miniCode.includes(".?.")) {
    console.error("No .?. placeholder found");
    process.exit(1);
  }

  miniCode = await expandInlineImports(miniCode, path.dirname(filePath), fs);
  miniCode = leftAlignHoles(miniCode);
  fileCode = leftAlignHoles(fileCode);

  const prompt = miniCode.replace(".?.", "{:FILL_HERE:}");

  const chat = new CopilotChatInstance(copilot, model);
  const response = await Effect.runPromise(
    chat.ask(prompt, { system: SYSTEM_PROMPT, stream: false }),
  );

  const match = response.match(/<COMPLETION>([\s\S]*?)<\/COMPLETION>/);
  let fill = match ? match[1] : response;

  fill = fill.replace(/\$/g, "$$$$");
  fill = fill.replace(/^\n+|\n+$/g, "");
  fileCode = fileCode.replace(".?.", fill);

  await Effect.runPromise(fs.writeFile(filePath, fileCode));
  console.log(`✓ Filled hole in ${filePath}`);
}

function leftAlignHoles(code: string): string {
  return code.replace(/^([ \t]+)(\.\?\.)$/gm, "$2");
}

async function expandInlineImports(
  code: string,
  baseDir: string,
  fs: FileSystem,
): Promise<string> {
  const lines = code.split("\n");
  const result: string[] = [];

  for (const line of lines) {
    const m1 = line.match(/^\/\/(\.\/.+)\/\/$/);
    const m2 = line.match(/^--\[(\.\/.+)\]--$/);
    const m3 = line.match(/^#\[(\.\/.+)\]#$/);

    const match = m1 || m2 || m3;
    if (match) {
      const importPath = path.join(baseDir, match[1]);
      const importedCode = await Effect.runPromise(fs.readFile(importPath));
      result.push(importedCode);
    } else {
      result.push(line);
    }
  }

  return result.join("\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
