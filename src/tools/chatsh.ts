#!/usr/bin/env bun
import os from "os";
import readline from "node:readline";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import * as Effect from "effect/Effect";
import { ModelResolver } from "../core/model-resolver.ts";
import { CopilotChatInstance } from "../core/chat-instance.ts";
import { LogService } from "../services/LogService.ts";
import { CopilotService } from "../services/CopilotService.ts";
import { RuntimeServices } from "../runtime.ts";
import type { CopilotModel } from "../api/models.ts";
import { StreamBuffer } from "../utils/stream-buffer.ts";
import { SyntaxHighlighter } from "../utils/syntax-highlighter.ts";

const execAsync = promisify(exec);

const SYSTEM_PROMPT = `This conversation is running inside a terminal session on ${os.platform()}.

To run bash commands, include scripts inside <RUN></RUN> tags like this:

<RUN>
shell_script_here
</RUN>

I will show you the outputs of every command you run.

IMPORTANT: Be CONCISE and DIRECT. Avoid unnecessary explanations.`;

interface ChatEnv {
  copilot: CopilotService;
  logService: LogService;
  model: CopilotModel;
  logFile: string;
  resolver: ModelResolver;
}

async function runChat({ copilot, logService, model, logFile, resolver }: ChatEnv) {
  console.log(`${model.name} (${model.id})\n`);

  const chat = new CopilotChatInstance(copilot, model);

  const log = (text: string) =>
    Effect.runPromise(logService.append(logFile, text)).catch(() => {});

  let aiCommandOutputs: string[] = [];
  let userCommandOutputs: string[] = [];

  type DropdownMode = "command" | "model" | null;
  type CommandEntry = { label: string; description: string };
  const COMMANDS: CommandEntry[] = [
    { label: "/model", description: "Switch the active AI model" },
  ];

  let inputBuffer = "";
  let cursor = 0;
  let commandIndex = 0;
  let modelIndex = 0;
  let lastFilterTerm = "";

  let dropdownState = {
    mode: null as DropdownMode,
    commands: [] as CommandEntry[],
    models: [] as CopilotModel[],
    filterTerm: "",
  };

  let allModels: CopilotModel[] | null = null;
  let pendingModelFetch: Promise<void> | null = null;
  let modelFetchError: string | null = null;

  let previousDropdownHeight = 0;
  let isSubmitting = false;

  const PROMPT_STYLED = "\x1b[1mλ \x1b[0m";
  const PROMPT_PLAIN = "λ ";

  const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
  let frameIdx = 0;
  let spinnerTimer: ReturnType<typeof setInterval> | null = null;
  let spinnerStopped = false;

  const startSpinner = () => {
    if (spinnerTimer) return;
    spinnerTimer = setInterval(() => {
      process.stderr.write(`\r${frames[frameIdx]}`);
      frameIdx = (frameIdx + 1) % frames.length;
    }, 80);
  };

  const stopSpinner = () => {
    if (spinnerStopped) return;
    spinnerStopped = true;
    if (spinnerTimer) {
      clearInterval(spinnerTimer);
      spinnerTimer = null;
    }
    process.stderr.write("\r \r");
  };

  const spinner = Effect.acquireRelease(
    Effect.sync(() => {
      startSpinner();
      return undefined;
    }),
    () => Effect.sync(stopSpinner),
  );

  const ensureModelCache = () => {
    if (allModels || pendingModelFetch) return;
    pendingModelFetch = Effect.runPromise(resolver.listModels())
      .then((models) => {
        allModels = models;
        modelFetchError = null;
      })
      .catch((err) => {
        modelFetchError = err instanceof Error ? err.message : String(err);
      })
      .finally(() => {
        pendingModelFetch = null;
        render();
      });
  };

  const updateDropdownState = () => {
    if (!inputBuffer.startsWith("/")) {
      dropdownState.mode = null;
      dropdownState.commands = [];
      dropdownState.models = [];
      dropdownState.filterTerm = "";
      return;
    }

    const afterSlash = inputBuffer.slice(1);
    const normalized = afterSlash.trimStart().toLowerCase();
    const isModelCommand = normalized.startsWith("model");

    if (isModelCommand) {
      ensureModelCache();
      const remainder = afterSlash.slice("model".length);
      const filterTerm = remainder.trimStart();
      if (filterTerm !== lastFilterTerm) {
        modelIndex = 0;
      }
      lastFilterTerm = filterTerm;
      dropdownState.mode = "model";
      dropdownState.filterTerm = filterTerm;
      dropdownState.models = allModels
        ? ModelResolver.filterModels(allModels, filterTerm)
        : [];
      const maxIndex = dropdownState.models.length - 1;
      if (maxIndex >= 0) {
        modelIndex = Math.min(modelIndex, maxIndex);
      } else {
        modelIndex = 0;
      }
      return;
    }

    const matches = COMMANDS.filter((command) =>
      normalized === "" || command.label.toLowerCase().includes(`/${normalized}`),
    );
    dropdownState.mode = matches.length > 0 ? "command" : null;
    dropdownState.commands = matches;
    dropdownState.filterTerm = normalized;
    const maxIndex = matches.length - 1;
    if (maxIndex >= 0) {
      commandIndex = Math.min(commandIndex, maxIndex);
    } else {
      commandIndex = 0;
    }
  };

  const getDropdownLines = (): string[] => {
    if (dropdownState.mode === "command") {
      if (!dropdownState.commands.length) return [];
      return dropdownState.commands.map((entry, idx) => {
        const highlight = idx === commandIndex ? "\x1b[7m" : "";
        const reset = highlight ? "\x1b[0m" : "";
        return `${highlight}  ${entry.label} ${entry.description}${reset}`;
      });
    }
    if (dropdownState.mode === "model") {
      if (modelFetchError) {
        return [`  ${modelFetchError}`];
      }
      if (!allModels) {
        return ["  Loading models..."];
      }
      if (!dropdownState.models.length) {
        return ["  No models match your filter."];
      }
      return dropdownState.models.map((candidate, idx) => {
        const highlight = idx === modelIndex ? "\x1b[7m" : "";
        const reset = highlight ? "\x1b[0m" : "";
        return `${highlight}  ${candidate.id} (${candidate.name})${reset}`;
      });
    }
    return [];
  };

  const render = () => {
    // 1. Go to start of prompt line and clear it
    process.stdout.write("\x1b[0G\x1b[2K");

    // 2. Render the prompt and input buffer
    process.stdout.write(PROMPT_STYLED + inputBuffer);

    // 3. Move to next line to clear "everything below" and render dropdown
    process.stdout.write("\n");
    process.stdout.write("\x1b[0J"); // Clear everything below the cursor

    // 4. Render new dropdown if any
    const dropdownLines = getDropdownLines();
    if (dropdownLines.length > 0) {
      for (const line of dropdownLines) {
        process.stdout.write(line + "\n");
      }
      // Move cursor back up to the prompt line
      // We moved down 1 initially (\n), then printed N lines (N * \n)
      // Total lines to move up = 1 + dropdownLines.length
      process.stdout.write(`\x1b[${1 + dropdownLines.length}A`);
    } else {
      // If no dropdown, we just moved down 1. Move back up 1.
      process.stdout.write(`\x1b[1A`);
    }

    // 5. Restore cursor horizontal position on the prompt line
    process.stdout.write("\x1b[0G");
    const cursorColumn = PROMPT_PLAIN.length + cursor;
    if (cursorColumn > 0) {
      process.stdout.write(`\x1b[${cursorColumn}C`);
    }
  };

  const resetInput = () => {
    inputBuffer = "";
    cursor = 0;
    commandIndex = 0;
    modelIndex = 0;
    lastFilterTerm = "";
    dropdownState = {
      mode: null,
      commands: [],
      models: [],
      filterTerm: "",
    };
  };

  const prepareForOutput = () => {
    // Clear everything below the current line to remove any dropdown artifacts
    process.stdout.write("\n\x1b[0J\x1b[1A");
    // Clear the current line
    process.stdout.write("\x1b[0G\x1b[2K");
  };

  const applyCommandSelection = () => {
    if (!dropdownState.commands.length) return;
    inputBuffer = `${dropdownState.commands[commandIndex].label} `;
    cursor = inputBuffer.length;
    dropdownState.mode = "model";
    lastFilterTerm = "";
    modelIndex = 0;
    updateDropdownState();
    render();
  };

  const handleModelSelection = async () => {
    if (dropdownState.mode !== "model" || !dropdownState.models.length) return;
    const selected = dropdownState.models[
      Math.min(modelIndex, dropdownState.models.length - 1)
    ];
    if (!selected) return;
    isSubmitting = true;
    try {
      chat.setModel(selected);
      prepareForOutput();
      process.stdout.write(`> Active model switched to: ${selected.id}\n`);
      await log(`\n> Active model switched to: ${selected.id}\n`);
      resetInput();
    } finally {
      isSubmitting = false;
      render();
    }
  };

  const handleLine = async (rawLine: string) => {
    if (isSubmitting) return;
    isSubmitting = true;
    try {
      const line = rawLine.trim();
      if (!line) {
        return;
      }

      if (line.startsWith("!")) {
        const cmd = line.slice(1);
        prepareForOutput();
        process.stdout.write("\n");
        try {
          const { stdout, stderr } = await execAsync(cmd);
          const output = stdout + stderr;
          process.stdout.write("\x1b[2m" + output + "\x1b[0m\n");
          userCommandOutputs.push(`\\sh\n${output}\n\\\``);
          await log(`\n$ ${cmd}\n${output}\n`);
        } catch (e: any) {
          const message = e?.message || String(e);
          process.stdout.write("\x1b[2m" + message + "\x1b[0m\n");
          userCommandOutputs.push(message);
          await log(`\n$ ${cmd}\n${message}\n`);
        }
        return;
      }

      const contextParts = [
        ...aiCommandOutputs.map((output) => `\\sh\n${output}\n\\\``),
        ...userCommandOutputs,
        line,
      ];
      const fullMessage = contextParts.join("\n");

      await log(`\n> ${line}\n`);

      prepareForOutput();
      process.stdout.write("\n");
      const highlighter = SyntaxHighlighter.create();
      const response = await Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            yield* spinner;
            const streamBuffer = yield* StreamBuffer.create(
              (text) => process.stdout.write(text),
              highlighter,
            );
            const result = yield* chat.ask(fullMessage, {
              system: SYSTEM_PROMPT,
              stream: true,
              onChunk: (chunk) =>
                Effect.gen(function* () {
                  stopSpinner();
                  yield* streamBuffer.write(chunk);
                }),
            });
            yield* streamBuffer.flush();
            return result;
          }),
        ),
      );

      process.stdout.write("\n");
      await log(response + "\n");

      const runMatches = [...response.matchAll(/<RUN>(.*?)<\/RUN>/gs)];
      aiCommandOutputs = [];

      for (const match of runMatches) {
        const script = match[1].trim();
        const answer = await askQuestion(`\nExecute this command? [Y/n]: `);

        if (answer.toLowerCase() === "n") {
          continue;
        }

        try {
          const { stdout, stderr } = await execAsync(script);
          const output = stdout + stderr;
          process.stdout.write("\x1b[2m" + output + "\x1b[0m\n");
          aiCommandOutputs.push(output);
          await log(`\n# ${script}\n${output}\n`);
        } catch (e: any) {
          const message = e?.message || String(e);
          process.stdout.write("\x1b[2m" + message + "\x1b[0m\n");
          aiCommandOutputs.push(message);
          await log(`\n# ${script}\n${message}\n`);
        }
      }

      userCommandOutputs = [];
    } finally {
      isSubmitting = false;
      resetInput();
      render();
    }
  };

  const keypressHandler = (str: string, key: readline.Key) => {
    if (str === "\x7f" || str === "\x08") {
      key.name = "backspace";
    }
    if (key.ctrl && key.name === "c") {
      cleanup();
      process.stdout.write("\n");
      process.exit(0);
      return;
    }
    if (key.name === "return") {
      if (dropdownState.mode === "command") {
        applyCommandSelection();
        return;
      }
      if (dropdownState.mode === "model") {
        void handleModelSelection();
        return;
      }
      const trimmed = inputBuffer.trim();
      if (!trimmed) {
        resetInput();
        render();
        return;
      }
      void handleLine(trimmed);
      return;
    }
    if (isSubmitting) return;
    switch (key.name) {
      case "backspace":
        if (cursor > 0) {
          inputBuffer =
            inputBuffer.slice(0, cursor - 1) + inputBuffer.slice(cursor);
          cursor -= 1;
        }
        updateDropdownState();
        render();
        return;
      case "delete":
        if (cursor < inputBuffer.length) {
          inputBuffer =
            inputBuffer.slice(0, cursor) + inputBuffer.slice(cursor + 1);
        }
        updateDropdownState();
        render();
        return;
      case "left":
        cursor = Math.max(0, cursor - 1);
        updateDropdownState();
        render();
        return;
      case "right":
        cursor = Math.min(inputBuffer.length, cursor + 1);
        updateDropdownState();
        render();
        return;
      case "home":
        cursor = 0;
        updateDropdownState();
        render();
        return;
      case "end":
        cursor = inputBuffer.length;
        updateDropdownState();
        render();
        return;
      case "escape":
        resetInput();
        render();
        return;
      case "up":
      case "down":
        if (dropdownState.mode === "command" && dropdownState.commands.length) {
          const delta = key.name === "up" ? -1 : 1;
          commandIndex =
            (commandIndex + delta + dropdownState.commands.length) %
            dropdownState.commands.length;
          updateDropdownState();
          render();
          return;
        }
        if (dropdownState.mode === "model" && dropdownState.models.length) {
          const delta = key.name === "up" ? -1 : 1;
          const length = dropdownState.models.length;
          modelIndex = (modelIndex + delta + length) % length;
          updateDropdownState();
          render();
          return;
        }
        return;
    }

    if (typeof str === "string" && str.length && !key.ctrl && !key.meta) {
      inputBuffer =
        inputBuffer.slice(0, cursor) + str + inputBuffer.slice(cursor);
      cursor += str.length;
    }

    updateDropdownState();
    render();
  };

  readline.emitKeypressEvents(process.stdin);

  const attachKeyListener = () => {
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
    }
    process.stdin.resume();
    process.stdin.on("keypress", keypressHandler);
  };

  const detachKeyListener = () => {
    process.stdin.off("keypress", keypressHandler);
  };

  const askQuestion = async (prompt: string) => {
    detachKeyListener();
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(false);
    }
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    const answer = await new Promise<string>((resolve) => {
      rl.question(prompt, resolve);
    });
    rl.close();
    attachKeyListener();
    render();
    return answer;
  };

  const handleSigint = () => {
    cleanup();
    process.stdout.write("\n");
    process.exit(0);
  };

  const cleanup = () => {
    detachKeyListener();
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(false);
    }
    process.stdin.pause();
    process.removeListener("SIGINT", handleSigint);
  };

  process.on("SIGINT", handleSigint);

  attachKeyListener();
  render();
}

async function runProgram() {
  const modelSpec = process.argv[2] || "g";
  const services = RuntimeServices.create();
  const resolver = await Effect.runPromise(
    ModelResolver.make(services.copilot, services.fs),
  );
  const model = await Effect.runPromise(resolver.resolve(modelSpec));
  const logFile = await Effect.runPromise(services.log.createLogFile("chatsh"));
  return {
    copilot: services.copilot,
    logService: services.log,
    model,
    logFile,
    resolver,
  };
}

runProgram()
  .then((env) => runChat(env))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
