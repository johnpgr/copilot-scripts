import { describe, expect, test } from "bun:test";
import * as Effect from "effect/Effect";
import { CopilotService } from "../services/CopilotService.ts";
import { FileSystemService } from "../services/FileSystemService.ts";
import { ModelResolver } from "./model-resolver.ts";
import type { CopilotModel } from "../api/models.ts";

describe("ModelResolver", () => {
  const sampleModels: CopilotModel[] = [
    {
      id: "gpt-4o",
      name: "OpenAI GPT-4o",
      tokenizer: "o200k_base",
      max_input_tokens: 16000,
      max_output_tokens: 16000,
      streaming: true,
      tools: true,
      use_responses: true,
    },
    {
      id: "claude-3.5",
      name: "Anthropic Claude 3.5",
      tokenizer: "c200k_base",
      max_input_tokens: 16000,
      max_output_tokens: 16000,
      streaming: true,
      tools: true,
      use_responses: true,
    },
  ];

  const noopFs = FileSystemService.of({
    readFile: () => Effect.succeed(""),
    writeFile: () => Effect.succeed(undefined),
    appendFile: () => Effect.succeed(undefined),
    ensureDir: () => Effect.succeed(undefined),
    exists: () => Effect.succeed(false),
    join: (...segments: string[]) => segments.join("/"),
  });

  const stubCopilot = CopilotService.of({
    request: () => Effect.succeed({} as never),
    stream: () => {
      throw new Error("Not used");
    },
  });

  test("caches the model list between requests", async () => {
    let invocationCount = 0;
    const fetcher = Effect.sync(() => {
      invocationCount += 1;
      return sampleModels;
    });

    const resolver = await Effect.runPromise(
      ModelResolver.make({
        fetcher,
        skipPrompt: true,
        shortcuts: {},
      }).pipe(
        Effect.provideService(CopilotService, stubCopilot),
        Effect.provideService(FileSystemService, noopFs),
      ),
    );

    await Effect.runPromise(resolver.listModels());
    await Effect.runPromise(resolver.listModels());

    expect(invocationCount).toBe(1);
  });

  test("filters models by id, name, and subsequence matches", () => {
    expect(
      ModelResolver.filterModels(sampleModels, "claude").map(
        (model) => model.id,
      ),
    ).toEqual(["claude-3.5"]);

    expect(
      ModelResolver.filterModels(sampleModels, "4o").map((model) => model.id),
    ).toEqual(["gpt-4o"]);

    expect(
      ModelResolver.filterModels(sampleModels, "gpo").map((model) => model.id),
    ).toEqual(["gpt-4o"]);
  });
});
