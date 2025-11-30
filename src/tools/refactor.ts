#!/usr/bin/env bun
import * as Effect from "effect/Effect";
import path from "path";
import { exec } from "child_process";
import { promisify } from "util";
import { CopilotChatInstance } from "../core/chat-instance";
import { ModelResolver } from "../core/model-resolver";
import { fetchModels } from "../api/models";
import { CopilotService } from "../services/CopilotService";
import { FileSystem } from "../services/FileSystemService";
import { RuntimeServices } from "../runtime";
import { countTokens } from "../utils/tokenizer";

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
- Return only the commands; no explanations.`;

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

async function main() {
  const filePath = process.argv[2];
  const modelSpec = process.argv[3] || "g";

  if (!filePath) {
    console.error("Usage: refactor <file> [<model>]");
    process.exit(1);
  }

  const services = RuntimeServices.create();
  const fs: FileSystem = services.fs;
  const copilot: CopilotService = services.copilot;

  const root = process.cwd();
  const absEntryPath = path.resolve(root, filePath);

  // 1. Read entry file and extract prompt
  const entryContent = await Effect.runPromise(fs.readFile(absEntryPath));
  const { body: fileBody, prompt: taskPrompt } =
    extractPromptSections(entryContent);

  // 2. Collect context (recursive imports)
  const files = await Effect.runPromise(
    collectContext(fs, absEntryPath, fileBody, root),
  );

  // 2b. Find referrers (reverse dependencies) using ripgrep
  const referrers = await Effect.runPromise(
    findReferrers(fs, absEntryPath, root),
  );

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

  // ... (rest of main)
}

// --- Reverse Dependency Search ---

const execAsync = promisify(exec);

function findReferrers(
  fs: FileSystem,
  targetAbsPath: string,
  root: string,
): Effect.Effect<Map<string, string>, any> {
  return Effect.gen(function* (_) {
    const referrers = new Map<string, string>();
    const filename = path.basename(targetAbsPath);
    const nameNoExt = filename.replace(/\.[^/.]+$/, "");
    
    // Heuristic: search for import statements containing the filename (without extension)
    // Matches: from "./foo" or from '../utils/foo' etc.
    // We use a regex that requires 'from' or 'import' and quotes, and the nameNoExt.
    // We intentionally don't use strict paths because resolving relative paths in regex is hard.
    // This might match false positives (e.g. 'foo-bar'), but the compaction phase will filter them.
    const regex = `(from|import|require).*['"].*${nameNoExt}['"]`;

    try {
      // Check if rg exists
      yield* _(Effect.tryPromise(() => execAsync("rg --version")));
      
      // Run rg
      const { stdout } = yield* _(
        Effect.tryPromise(() => 
          execAsync(`rg -l "${regex}" .`, { cwd: root, maxBuffer: 1024 * 1024 * 10 })
        )
      );

      const lines = stdout.split("\n").map(l => l.trim()).filter(l => l);
      
      for (const relPath of lines) {
        const absPath = path.resolve(root, relPath);
        if (absPath === targetAbsPath) continue; // Skip self
        
        // Check if it's likely a source file
        if (!relPath.match(/\.(ts|js|tsx|jsx|py|rb|go|rs|cpp|h|c|java)$/)) continue;

        const content = yield* _(fs.readFile(absPath));
        referrers.set(relPath, content);
      }
    } catch (err) {
      // Ignore errors (e.g. rg not found, or no matches)
      // console.log("Ripgrep failed or not found, skipping reverse dependency search.");
    }

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
    ): Effect.Effect<void, any> =>
      Effect.gen(function* (_) {
        const resolved = path.resolve(currentPath);
        if (visited.has(resolved)) return;
        visited.add(resolved);

        let text = content;
        if (text === null) {
          const exists = yield* _(fs.exists(resolved));
          if (!exists) {
            console.warn(
              `Warning: Import not found: ${path.relative(root, resolved)}`,
            );
            return;
          }
          text = yield* _(fs.readFile(resolved));
        }

        const relPath = path.relative(root, resolved);
        context.set(relPath, text!);

        const imports = findImports(text!);
        for (const importPath of imports) {
          const nextPath = path.resolve(path.dirname(resolved), importPath);
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

  // Skip trailing blank lines
  while (idx >= 0 && lines[idx].trim() === "") {
    idx--;
  }

  const promptLines: string[] = [];

  // Read comment block from bottom
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
    // Fallback if no explicit prompt block found
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
    // Split by double newlines, keeping indentation/content reasonably
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
    const visibleBlocks = group.blocks.filter(
      (b) => !omit || !omit.has(b.id),
    );

    if (visibleBlocks.length === 0 && omit && omit.size > 0) continue;

    parts.push(`${group.file}:`);
    for (const block of visibleBlocks) {
      parts.push(`!${block.id}\n${block.content}\n`);
    }
    parts.push(""); // Extra spacing between files
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
      
      // Omit is inclusive in prompt text examples usually, but let's stick to 
      // simple range parsing. If prompt says "100-103 omits 100, 101, 102", 
      // that means end is exclusive.
      // Let's match the prompt instructions: "use START-END (end exclusive)"
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

async function applyCommands(
  commands: EditCommand[],
  state: BlockState,
  fs: FileSystem,
) {
  const filePatches = new Map<string, Map<number, string>>();

  // Process patches
  for (const cmd of commands) {
    if (cmd.type === "patch") {
      const block = state.blockMap.get(cmd.blockId);
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

  // Apply patches to files
  for (const [file, patches] of filePatches.entries()) {
    const group = state.files.find((f) => f.file === file);
    if (!group) continue;

    const updated = group.blocks
      .map((b) => patches.get(b.id) ?? b.content)
      .join("\n\n"); // Reconstruct with standard spacing

    await Effect.runPromise(fs.writeFile(file, updated));
    console.log(`patched ${file}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
