#!/usr/bin/env bun
import * as Effect from "effect/Effect";
import * as Stream from "effect/Stream";
import { execSync } from "node:child_process";
import { chatStream } from "../api/chat.ts";
import { ModelResolver } from "../core/model-resolver.ts";
import { runMain } from "../runtime.ts";

const SYSTEM_PROMPT = `Write commit message for the change with commitizen convention. Keep the title under 50 characters and wrap message at 72 characters. Format as a gitcommit code block.`;

interface ParsedArgs {
  modelSpec: string;
}

const USAGE = `Usage: commitmsg [-X | --model-id]

Options:
  -X            Model shortcut (single char): -g, -c, -o
  --model-id    Full model ID: --gpt-4.1, --claude-3.5-sonnet

Examples:
  commitmsg -g        Generate commit message with GPT
  commitmsg --gpt-4.1 Generate with specific model
  commitmsg           Use default model (g)
`;

const parseArgs = (argv: string[]): ParsedArgs => {
  const args = argv.slice(2);

  const invalidFlag = args.find(
    (a) => a.startsWith("-") && !a.startsWith("--") && a.length > 2,
  );
  if (invalidFlag) {
    console.error(`Error: Invalid flag "${invalidFlag}"\n`);
    console.error(USAGE);
    process.exit(1);
  }

  const modelFlagIndex = args.findIndex(
    (a) => a.startsWith("--") || (a.startsWith("-") && a.length === 2),
  );

  if (modelFlagIndex !== -1) {
    const flag = args[modelFlagIndex];
    const modelSpec = flag.startsWith("--") ? flag.slice(2) : flag.slice(1);
    return { modelSpec: modelSpec || "g" };
  }

  return { modelSpec: "g" };
};

const getStagedDiff = (): string => {
  try {
    return execSync("git diff --staged", { encoding: "utf-8" });
  } catch {
    return "";
  }
};

const extractCommitMessage = (content: string): string => {
  const match = content.match(/```gitcommit\s*\n([\s\S]*?)```/);
  return match ? match[1].trim() : content.trim();
};

const main = Effect.gen(function* () {
  const { modelSpec } = parseArgs(process.argv);
  const resolver = yield* ModelResolver.make();
  const model = yield* resolver.resolve(modelSpec);

  const diff = getStagedDiff();
  if (!diff) {
    console.error("No staged changes found");
    process.exit(1);
  }

  const userMessage = `Here are the staged changes:\n\n${diff}`;

  const stream = chatStream(model, [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: userMessage },
  ]);

  const response = yield* Stream.runFold(stream, "", (acc, chunk) => {
    process.stderr.write(chunk);
    return acc + chunk;
  });

  process.stderr.write("\n");

  const message = extractCommitMessage(response);
  process.stdout.write(message);
});

runMain(main).catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
