#!/usr/bin/env bun
import * as Effect from "effect/Effect";
import { CopilotChatInstance } from "../core/chat-instance";
import { ModelResolver } from "../core/model-resolver";
import { CopilotService } from "../services/CopilotService";
import { FileSystem } from "../services/FileSystemService";
import { RuntimeServices } from "../runtime";
import { countTokens } from "../utils/tokenizer";

const EDITING_PROMPT_TEMPLATE = `
You are an expert software engineer helping refactor code.

Context blocks:
{CONTEXT}

Task:
{TASK}

Rules:
- Propose edits using <patch block="ID"> ... </patch> commands, where ID matches the !N labels.
- You may also add new files with <write file="path">...</write>.
- To delete a file, emit <delete file="path" />.
- Do not rewrite unchanged blocks.
- Return only the commands; no explanations.`;

interface Block {
  id: number;
  file: string;
  content: string;
}

interface PatchCommand {
  type: "patch";
  blockId: number;
  content: string;
}

interface WriteCommand {
  type: "write";
  file: string;
  content: string;
}

interface DeleteCommand {
  type: "delete";
  file: string;
}

type EditCommand = PatchCommand | WriteCommand | DeleteCommand;

async function main() {
  const filePath = process.argv[2];
  const modelSpec = process.argv[3] || "g";

  if (!filePath) {
    console.error("Usage: refactor <file> [<model>]");
    process.exit(1);
  }

  const services = RuntimeServices.create();
  const resolver = await Effect.runPromise(
    ModelResolver.make(services.copilot, services.fs),
  );
  const model = await Effect.runPromise(resolver.resolve(modelSpec));
  const fs: FileSystem = services.fs;
  const copilot: CopilotService = services.copilot;

  const fileCode = await Effect.runPromise(fs.readFile(filePath));
  const { code, task } = extractTask(fileCode);

  const files = new Map<string, string>([[filePath, code]]);
  const blocks = buildBlocks(files);
  const context = formatBlocks(blocks);
  const tokenCount = countTokens(context);
  console.log(`count: ${tokenCount} tokens`);

  const prompt = EDITING_PROMPT_TEMPLATE.replace("{CONTEXT}", context).replace(
    "{TASK}",
    task || "Apply the requested changes.",
  );

  const chat = new CopilotChatInstance(copilot, model);
  const response = await Effect.runPromise(chat.ask(prompt, { stream: true }));

  const commands = parseCommands(response);
  await applyCommands(commands, blocks, fs);

  console.log("\n✓ Refactor complete");
}

function extractTask(code: string): { code: string; task: string } {
  const lines = code.split("\n");
  const taskLines: string[] = [];

  for (let i = lines.length - 1; i >= 0; i--) {
    const trimmed = lines[i].trim();
    if (
      trimmed.startsWith("//") ||
      trimmed.startsWith("#") ||
      trimmed.startsWith("--")
    ) {
      taskLines.unshift(trimmed.replace(/^(\/\/|#|--)\s*/, ""));
    } else if (trimmed) {
      break;
    }
  }

  return {
    code: lines.slice(0, lines.length - taskLines.length).join("\n"),
    task: taskLines.join("\n"),
  };
}

function buildBlocks(files: Map<string, string>): Block[] {
  const blocks: Block[] = [];
  let nextId = 0;

  for (const [file, content] of files.entries()) {
    const fileBlocks = content.split(/\n\n+/).filter((b) => b.trim());

    for (const blockContent of fileBlocks) {
      blocks.push({ id: nextId++, file, content: blockContent });
    }
  }

  return blocks;
}

function formatBlocks(blocks: Block[]): string {
  const byFile = new Map<string, Block[]>();

  for (const block of blocks) {
    if (!byFile.has(block.file)) byFile.set(block.file, []);
    byFile.get(block.file)!.push(block);
  }

  const parts: string[] = [];
  for (const [file, fileBlocks] of byFile.entries()) {
    parts.push(`${file}:\n`);
    for (const block of fileBlocks) {
      parts.push(`!${block.id}\n${block.content}\n`);
    }
  }

  return parts.join("\n");
}

function parseCommands(response: string): EditCommand[] {
  const commands: EditCommand[] = [];

  for (const match of response.matchAll(
    /<patch\s+block="(\d+)">([\s\S]*?)<\/patch>/g,
  )) {
    commands.push({
      type: "patch",
      blockId: parseInt(match[1], 10),
      content: match[2].trim(),
    });
  }

  for (const match of response.matchAll(
    /<write\s+file="([^"]+)">([\s\S]*?)<\/write>/g,
  )) {
    commands.push({ type: "write", file: match[1], content: match[2].trim() });
  }

  for (const match of response.matchAll(/<delete\s+file="([^"]+)"\s*\/>/g)) {
    commands.push({ type: "delete", file: match[1] });
  }

  return commands;
}

async function applyCommands(
  commands: EditCommand[],
  blocks: Block[],
  fs: FileSystem,
) {
  const filePatches = new Map<string, Map<number, string>>();

  for (const cmd of commands) {
    if (cmd.type === "patch") {
      const block = blocks.find((b) => b.id === cmd.blockId);
      if (!block) continue;
      if (!filePatches.has(block.file)) {
        filePatches.set(block.file, new Map());
      }
      filePatches.get(block.file)!.set(block.id, cmd.content);
    } else if (cmd.type === "write") {
      await Effect.runPromise(fs.writeFile(cmd.file, cmd.content));
      console.log(`wrote ${cmd.file}`);
    } else if (cmd.type === "delete") {
      await Effect.runPromise(fs.writeFile(cmd.file, ""));
      console.log(`deleted ${cmd.file}`);
    }
  }

  for (const [file, patches] of filePatches.entries()) {
    const fileBlocks = blocks.filter((b) => b.file === file);
    const updated = fileBlocks
      .map((b) => patches.get(b.id) ?? b.content)
      .join("\n\n");
    await Effect.runPromise(fs.writeFile(file, updated));
    console.log(`patched ${file}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
