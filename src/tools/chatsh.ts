#!/usr/bin/env bun
import os from "os";
import readline from "node:readline";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import * as Effect from "effect/Effect";
import { ModelResolver } from "../core/model-resolver";
import { CopilotChatInstance } from "../core/chat-instance";
import { LogService } from "../services/LogService";
import { CopilotService } from "../services/CopilotService";
import { RuntimeServices } from "../runtime";
import { CopilotModel } from "../api/models";

const execAsync = promisify(exec);

const SYSTEM_PROMPT = `This conversation is running inside a terminal session on ${os.platform()}.

To run bash commands, include scripts inside <RUN></RUN> tags like this:

<RUN>
shell_script_here
</RUN>

I will show you the outputs of every command you run.

IMPORTANT: Be CONCISE and DIRECT. Avoid unnecessary explanations.`;

async function askQuestion(
  rl: readline.Interface,
  prompt: string,
): Promise<string> {
  return new Promise((resolve) => rl.question(prompt, resolve));
}

interface ChatEnv {
  copilot: CopilotService;
  logService: LogService;
  model: CopilotModel;
  logFile: string;
}

async function runChat({ copilot, logService, model, logFile }: ChatEnv) {
  console.log(`${model.name} (${model.id})\n`);

  const chat = new CopilotChatInstance(copilot, model);

  const log = (text: string) =>
    Effect.runPromise(logService.append(logFile, text)).catch(() => {});

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: "\x1b[1mλ \x1b[0m",
  });

  let aiCommandOutputs: string[] = [];
  let userCommandOutputs: string[] = [];

  rl.prompt();

  rl.on("line", async (line) => {
    line = line.trim();
    if (!line) {
      rl.prompt();
      return;
    }

    if (line.startsWith("!")) {
      const cmd = line.slice(1);
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
      rl.prompt();
      return;
    }

    const contextParts = [
      ...aiCommandOutputs.map((output) => `\\sh\n${output}\n\\\``),
      ...userCommandOutputs,
      line,
    ];
    const fullMessage = contextParts.join("\n");

    await log(`\n> ${line}\n`);
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

    const response = await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* (_) {
          yield* _(spinner);
          return yield* _(
            chat.ask(fullMessage, {
              system: SYSTEM_PROMPT,
              stream: true,
              onChunk: (chunk) =>
                Effect.sync(() => {
                  stopSpinner();
                  process.stdout.write(chunk);
                }),
            }),
          );
        }),
      ),
    );

    process.stdout.write("\n");
    await log(response + "\n");

    const runMatches = [...response.matchAll(/<RUN>(.*?)<\/RUN>/gs)];
    aiCommandOutputs = [];

    for (const match of runMatches) {
      const script = match[1].trim();
      const answer = await askQuestion(rl, `\nExecute this command? [Y/n]: `);

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
    rl.prompt();
  });

  rl.on("SIGINT", () => {
    rl.close();
  });

  rl.on("close", () => {
    process.stdout.write("\n");
    process.exit(0);
  });
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
  };
}

runProgram()
  .then((env) => runChat(env))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
