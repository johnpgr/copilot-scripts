#!/usr/bin/env bun
import * as Effect from "effect/Effect";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import { CopilotChatInstance } from "../core/chat-instance.ts";
import { ModelResolver } from "../core/model-resolver.ts";
import { fetchModels } from "../api/models.ts";
import { CopilotService } from "../services/CopilotService.ts";
import { FileSystemService, type FileSystem } from "../services/FileSystemService.ts";
import { type FsError } from "../errors/index.ts";
import { AppLayer } from "../runtime.ts";
import { countTokens } from "../utils/tokenizer.ts";

const COMPACTING_PROMPT_TEMPLATE = `You're a context compactor.

Consider the following files, split into labeled blocks:

{CONTEXT}

(Each block is annotated with a leading '!id' marker, identifying it.)

Now, consider the following TASK:

{TASK}

Your goal is NOT to complete the TASK.

Your goal is to omit EVERY block that is IRRELEVANT to the TASK.

A block is RELEVANT when:
- It must be directly edited to complete the TASK.
- It declares types used on blocks that must be edited.
- It defines functions used on blocks that must be edited.
- It declares types or functions used on blocks
  ... that declare types of functions used on blocks
  ... that must be edited to complete the TASK
  (and so on, transitively).
- It contains helpful documentation about the domain.
- It contain similar functions that can serve as inspiration.
- It can help understanding the codebase's style or domain.

A block is IRRELEVANT when:
- It is unequivocally, completely unrelated to the TASK at hands.

To omit blocks, output an <omit> command listing their ids:

<omit>
12
100-103
</omit>

List one block id per line, or use START-END (end exclusive) to omit a range.
For example, "100-103" omits blocks 100, 101, and 102.`;

const EDITING_PROMPT_TEMPLATE = `
You are an expert software engineer helping refactor code.

Context blocks:
{CONTEXT}

Task:
{TASK}

Rules:
- Propose edits using <patch block="ID"> ... </patch> commands.
- ID matches the !N labels, but do NOT include the '!' character in the block attribute (e.g. block="12", NOT block="!12").
- IMPORTANT: The content inside <patch> must be the **FULL NEW CONTENT** of the block, not a diff. Do not use "+" or "-" lines.
- You may also add new files with <write file="path">...</write>.
- To delete a file, emit <delete file="path" />.
- Do not rewrite unchanged blocks.
- Do not wrap the output in markdown code blocks (e.g. 
---
xml
---
).
- After all commands, append a <summary> ... </summary> block explaining the changes.
- Return only the commands and the summary; no conversational filler.`;

const IMPORT_PATTERNS = [
  /^#\[(\.\/[^\]]+)\]$/,
  /^--\[(\.\/[^\]]+)\]$/,
  /^\/\/\[(\.\/[^\]]+)\]$/,
  /^\s*import\s+.*?\s+from\s+['"](\.[^'"]+)['"]/,
  /^\s*import\s+['"](\.[^'"]+)['"]/,
  /^\s*export\s+.*?\s+from\s+['"](\.[^'"]+)['"]/,
  /^\s*const\s+.*?\s*=\s*require\(['"](\.[^'"]+)['"]\)/,
];

interface BlockEntry {
  id: number;
  file: string;
  content: string;
}

interface FileBlockGroup {
  file: string;
  blocks: BlockEntry[];
}

interface BlockState {
  files: FileBlockGroup[];
  blockMap: Map<number, BlockEntry>;
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

const main = Effect.gen(function* (_) {
  const filePath = process.argv[2];
  const modelSpec = process.argv[3] || "g";

  if (!filePath) {
    console.error("Usage: refactor <file> [<model>]");
    return process.exit(1);
  }

  const fs = yield* _(FileSystemService);
  const copilot = yield* _(CopilotService);

  const root = process.cwd();
  const absEntryPath = path.resolve(root, filePath);

  // 1. Read entry file and extract prompt
  const entryContent = yield* _(fs.readFile(absEntryPath));
  const { body: fileBody, prompt: taskPrompt } =
    extractPromptSections(entryContent);

  // 2. Collect context (recursive imports)
  const files = yield* _(collectContext(fs, absEntryPath, fileBody, root));

  // 2b. Find referrers (reverse dependencies) using ripgrep
  const referrers = yield* _(findReferrers(fs, absEntryPath, root));

  for (const [relPath, content] of referrers) {
    if (!files.has(relPath)) {
      files.set(relPath, content);
      console.log(`Included referrer: ${relPath}`);
    }
  }

  // 3. Build blocks
  const blockState = buildBlockState(files);
  const fullContext = formatBlocks(blockState);
  const totalTokens = countTokens(fullContext + "\n" + taskPrompt);

  console.log(`Files: ${files.size}`);
  console.log(`Total tokens: ${totalTokens}`);

  // 4. Resolve model
  console.log("Resolving model...");
  const resolver = yield* _(ModelResolver.make());
  console.log("Resolver created.");
  const model = yield* _(resolver.resolve(modelSpec));
  console.log(`Model resolved: ${model.id}`);

  // 5. Compacting Phase (if needed)
  let contextToUse = fullContext;
  const shouldCompact = files.size > 1 && totalTokens >= 32000;

  if (shouldCompact) {
    console.log("\n[Compacting phase...]");

    // Try to find a faster/cheaper model for compaction
    const allModels = yield* _(fetchModels);
    const compactorCandidates = ["mini", "turbo", "haiku", "flash"];
    const fastModel =
      allModels.find((m) =>
        compactorCandidates.some((c) => m.id.toLowerCase().includes(c)),
      ) || model;

    console.log(`Using compactor model: ${fastModel.id}`);

    const chat = new CopilotChatInstance(copilot, fastModel);
    const compactingPrompt = COMPACTING_PROMPT_TEMPLATE.replace(
      "{CONTEXT}",
      fullContext,
    ).replace("{TASK}", taskPrompt);

    const response = yield* _(chat.ask(compactingPrompt, { stream: true }));

    const omittedIds = parseOmitCommands(response);
    console.log(`\nOmitted ${omittedIds.size} irrelevant blocks`);
    contextToUse = formatBlocks(blockState, omittedIds);
  } else {
    if (files.size <= 1) console.log("Skipping compaction: single file");
    else console.log("Skipping compaction: < 32k tokens");
  }

  // 6. Editing Phase
  console.log("\n[Editing phase...]");
  const editingPrompt = EDITING_PROMPT_TEMPLATE.replace(
    "{CONTEXT}",
    contextToUse,
  ).replace("{TASK}", taskPrompt);

  const chat = new CopilotChatInstance(copilot, model);
  const response = yield* _(chat.ask(editingPrompt, { stream: true }));

  // 7. Apply changes
  const commands = parseCommands(response);
  const messages = yield* _(applyCommands(commands, blockState, fs));

  console.log("\n✓ Refactor complete");
  if (messages.length > 0) {
    console.log(messages.join("\n"));
  }
});

// --- Reverse Dependency Search ---

const execFileAsync = promisify(execFile);

function findReferrers(
  fs: FileSystem,
  targetAbsPath: string,
  root: string,
) {
  return Effect.gen(function* (_) {
    const referrers = new Map<string, string>();
    const filename = path.basename(targetAbsPath);
    const nameNoExt = filename.replace(/\.[^/.]+$/, "");

    const regex = `(from|import|require).*['"].*${nameNoExt}['"]`;

    yield* _(
      Effect.tryPromise({
        try: () => execFileAsync("rg", ["--version"]),
        catch: () => new Error("rg not found"),
      }).pipe(
        Effect.flatMap(() =>
          Effect.tryPromise({
            try: () =>
              execFileAsync("rg", ["-l", regex, "."], {
                cwd: root,
                maxBuffer: 1024 * 1024 * 10,
              }),
            catch: () => new Error("rg failed"),
          }),
        ),
        Effect.map(({ stdout }) => {
          const lines = stdout
            .split("\n")
            .map((l) => l.trim())
            .filter((l) => l);
          return lines;
        }),
        Effect.flatMap((lines) =>
          Effect.forEach(lines, (relPath) =>
            Effect.gen(function* (_) {
              const absPath = path.resolve(root, relPath);
              if (absPath === targetAbsPath) return;

              if (
                !relPath.match(/\.(ts|js|tsx|jsx|py|rb|go|rs|cpp|h|c|java)$/)
              )
                return;

              const content = yield* _(fs.readFile(absPath));
              referrers.set(relPath, content);
            }),
          ),
        ),
        Effect.catchAll(() => Effect.void),
      ),
    );

    return referrers;
  });
}

// --- Context Collection ---

function matchImportPath(line: string): string | null {
  for (const pattern of IMPORT_PATTERNS) {
    const match = line.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }
  return null;
}

function findImports(content: string): string[] {
  const imports = new Set<string>();
  const lines = content.split(/\r?\n/);
  for (const line of lines) {
    const match = matchImportPath(line);
    if (match) {
      imports.add(match);
    }
  }
  return Array.from(imports);
}

function collectContext(
  fs: FileSystem,
  entryFile: string,
  entryContent: string,
  root: string,
) {
  return Effect.gen(function* (_) {
    const context = new Map<string, string>();
    const visited = new Set<string>();

    const visit = (
      currentPath: string,
      content: string | null,
    ): Effect.Effect<void, FsError> =>
      Effect.gen(function* (_) {
        let finalPath = path.resolve(currentPath);
        let text = content;
        let exists = true;

        if (text === null) {
          exists = yield* _(fs.exists(finalPath));
          if (!exists) {
            const extensions = [".ts", ".tsx", ".js", ".jsx", ".json"];
            for (const ext of extensions) {
              const p = finalPath + ext;
              if (yield* _(fs.exists(p))) {
                finalPath = p;
                exists = true;
                break;
              }
            }
          }
        }

        if (visited.has(finalPath)) return;
        visited.add(finalPath);

        if (!exists) {
          console.warn(
            `Warning: Import not found: ${path.relative(root, path.resolve(currentPath))}`,
          );
          return;
        }

        if (text === null) {
          text = yield* _(fs.readFile(finalPath));
        }

        const relPath = path.relative(root, finalPath);
        context.set(relPath, text!);

        const imports = findImports(text!);
        for (const importPath of imports) {
          const nextPath = path.resolve(path.dirname(finalPath), importPath);
          yield* _(visit(nextPath, null));
        }
      });

    yield* _(visit(entryFile, entryContent));
    return context;
  });
}

// --- Prompt Extraction ---

function extractPromptSections(raw: string): { body: string; prompt: string } {
  const lines = raw.split("\n");
  let idx = lines.length - 1;

  while (idx >= 0 && lines[idx].trim() === "") {
    idx--;
  }

  const promptLines: string[] = [];

  while (idx >= 0) {
    const line = lines[idx];
    const trimmed = line.trim();
    let content: string | null = null;

    if (trimmed.startsWith("//")) content = trimmed.slice(2);
    else if (trimmed.startsWith("#")) content = trimmed.slice(1);
    else if (trimmed.startsWith("--")) content = trimmed.slice(2);

    if (content !== null && !matchImportPath(line)) {
      promptLines.push(content.trim());
      idx--;
    } else {
      break;
    }
  }

  if (promptLines.length === 0) {
    return { body: raw, prompt: "Apply the requested changes." };
  }

  const body = lines.slice(0, idx + 1).join("\n").trim();
  const prompt = promptLines.reverse().join("\n").trim();

  return { body, prompt };
}

// --- Block Management ---

function buildBlockState(files: Map<string, string>): BlockState {
  let nextId = 0;
  const fileGroups: FileBlockGroup[] = [];
  const blockMap = new Map<number, BlockEntry>();

  for (const [file, content] of files.entries()) {
    const rawBlocks = content.split(/\n\n+/).filter((b) => b.trim());
    const blocks: BlockEntry[] = [];

    for (const blockContent of rawBlocks) {
      const block: BlockEntry = { id: nextId++, file, content: blockContent };
      blocks.push(block);
      blockMap.set(block.id, block);
    }

    fileGroups.push({ file, blocks });
  }

  return { files: fileGroups, blockMap };
}

function formatBlocks(state: BlockState, omit?: Set<number>): string {
  const parts: string[] = [];

  for (const group of state.files) {
    const visibleBlocks = group.blocks.filter((b) => !omit || !omit.has(b.id));

    if (visibleBlocks.length === 0 && omit && omit.size > 0) continue;

    parts.push(`${group.file}:`);
    for (const block of visibleBlocks) {
      parts.push(`!${block.id}\n${block.content}\n`);
    }
    parts.push("");
  }

  return parts.join("\n");
}

// --- Command Parsing ---

function parseOmitCommands(response: string): Set<number> {
  const omitted = new Set<number>();
  const omitRegex = /<omit>(?:[\s\S]*?)<\/omit>/g;
  const rangeRegex = /(\d+)(?:\s*-\s*(\d+))?/g;

  let match;
  while ((match = omitRegex.exec(response)) !== null) {
    const content = match[0];
    let rangeMatch;
    while ((rangeMatch = rangeRegex.exec(content)) !== null) {
      const start = parseInt(rangeMatch[1], 10);
      const end = rangeMatch[2] ? parseInt(rangeMatch[2], 10) : start + 1;
      const actualEnd = rangeMatch[2] ? end : start + 1;

      for (let i = start; i < actualEnd; i++) {
        omitted.add(i);
      }
    }
  }
  return omitted;
}

function parseCommands(response: string): EditCommand[] {
  const commands: EditCommand[] = [];

  for (const match of response.matchAll(
    /<patch\s+block="!?(\d+)">([\s\S]*?)<\/patch>/g,
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

function applyCommands(
  commands: EditCommand[],
  state: BlockState,
  fs: FileSystem,
) {
  return Effect.gen(function* (_) {
    const messages: string[] = [];
    const filePatches = new Map<string, Map<number, string>>();

    for (const cmd of commands) {
      if (cmd.type === "patch") {
        const block = state.blockMap.get(cmd.blockId);
        if (!block) continue;
        if (!filePatches.has(block.file)) {
          filePatches.set(block.file, new Map());
        }
        filePatches.get(block.file)!.set(block.id, cmd.content);
      } else if (cmd.type === "write") {
        yield* _(fs.writeFile(cmd.file, cmd.content));
        messages.push(`wrote ${cmd.file}`);
      } else if (cmd.type === "delete") {
        yield* _(fs.writeFile(cmd.file, ""));
        messages.push(`deleted ${cmd.file}`);
      }
    }

    for (const [file, patches] of filePatches.entries()) {
      const group = state.files.find((f) => f.file === file);
      if (!group) continue;

      const updated = group.blocks
        .map((b) => patches.get(b.id) ?? b.content)
        .join("\n\n");

      yield* _(fs.writeFile(file, updated));
      messages.push(`patched ${file}`);
    }

    return messages;
  });
}

Effect.runPromise(main.pipe(Effect.provide(AppLayer))).catch((err) => {
  console.error(err);
  process.exit(1);
});