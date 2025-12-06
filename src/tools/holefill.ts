#!/usr/bin/env bun
import * as Effect from "effect/Effect";
import path from "path";
import { CopilotChatInstance } from "../core/chat-instance.ts";
import { ModelResolver } from "../core/model-resolver.ts";
import { runMain } from "../runtime.ts";
import { CopilotService } from "../services/CopilotService.ts";
import {
  FileSystemService,
  type FileSystem,
} from "../services/FileSystemService.ts";

const SYSTEM_PROMPT = `You fill EXACTLY ONE placeholder inside a user-provided file.

The user will send you a complete file with a single {:FILL_HERE:} marker.

Rules:
- Inspect the surrounding text to understand context
- Preserve indentation, spacing, and code style
- Output ONLY the replacement text (no explanations)
- Wrap your output in <COMPLETION>...</COMPLETION> tags
- Do not include the marker itself in your response

Example:
User sends: function test() {\n  {:FILL_HERE:}\n}
You respond: <COMPLETION>return 42;</COMPLETION>`;

function leftAlignHoles(code: string): string {
  return code.replace(/^([ \t]+)(\.\?\.)$/gm, "$2");
}

function expandInlineImports(code: string, baseDir: string, fs: FileSystem) {
  return Effect.gen(function* () {
    const lines = code.split("\n");
    const result: string[] = [];

    for (const line of lines) {
      const m1 = line.match(/^\/\/(\.\/.+)\/\/$/);
      const m2 = line.match(/^--\[(\.\/.+)\]--$/);
      const m3 = line.match(/^#\[(\.\/.+)\]#$/);

      const match = m1 || m2 || m3;
      if (match) {
        const importPath = path.join(baseDir, match[1]);
        const importedCode = yield* fs.readFile(importPath);
        result.push(importedCode);
      } else {
        result.push(line);
      }
    }
    return result.join("\n");
  });
}

const main = Effect.gen(function* () {
  const filePath = process.argv[2];
  const miniPath = process.argv[3] || "";
  const modelSpec = process.argv[4] || "g";

  if (!filePath) {
    console.error("Usage: holefill <file> [<mini_file>] [<model>]");
    return process.exit(1);
  }

  const fs = yield* FileSystemService;
  const copilot = yield* CopilotService;
  const resolver = yield* ModelResolver.make();
  const model = yield* resolver.resolve(modelSpec);

  let fileCode = yield* fs.readFile(filePath);
  let miniCode = miniPath ? yield* fs.readFile(miniPath) : fileCode;

  if (!miniCode.includes(".?.")) {
    console.error("No .?. placeholder found");
    return process.exit(1);
  }

  miniCode = yield* expandInlineImports(miniCode, path.dirname(filePath), fs);
  miniCode = leftAlignHoles(miniCode);
  fileCode = leftAlignHoles(fileCode);

  const prompt = miniCode.replace(".?.", "{:FILL_HERE:}");
  const chat = new CopilotChatInstance(copilot, model);
  const response = yield* chat.ask(prompt, {
    system: SYSTEM_PROMPT,
    stream: false,
  });

  const match = response.match(/<COMPLETION>([\s\S]*?)<\/COMPLETION>/);
  let fill = match ? match[1] : response;

  fill = fill.replace(/\$/g, "$$$$");
  fill = fill.replace(/^\n+|\n+$/g, "");
  fileCode = fileCode.replace(".?.", fill);

  yield* fs.writeFile(filePath, fileCode);
  console.log(`✓ Filled hole in ${filePath}`);
});

runMain(main).catch((err) => {
  console.error(err);
  process.exit(1);
});
