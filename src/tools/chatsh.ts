#!/usr/bin/env bun
import os from 'os';
import readline from 'node:readline';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { authenticate } from '../auth/copilot-auth';
import { CopilotClient } from '../api/copilot-client';
import { ModelResolver } from '../core/model-resolver';
import { CopilotChatInstance } from '../core/chat-instance';
import { createLogFile, appendLog } from '../utils/logger';

const execAsync = promisify(exec);

const SYSTEM_PROMPT = `This conversation is running inside a terminal session on ${os.platform()}.

To run bash commands, include scripts inside <RUN></RUN> tags like this:

<RUN>
shell_script_here
</RUN>

I will show you the outputs of every command you run.

IMPORTANT: Be CONCISE and DIRECT. Avoid unnecessary explanations.`;

async function askQuestion(rl: readline.Interface, prompt: string): Promise<string> {
  return new Promise(resolve => rl.question(prompt, resolve));
}

async function main() {
  const modelSpec = process.argv[2] || 'g';

  const token = await authenticate();
  const client = new CopilotClient(token);
  const resolver = new ModelResolver(client);
  const model = await resolver.resolve(modelSpec);

  console.log(`${model.name} (${model.id})\n`);

  const chat = new CopilotChatInstance(client, model);

  const logFile = await createLogFile('chatsh');
  const log = (text: string) => appendLog(logFile, text);

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: '\x1b[1mλ \x1b[0m',
  });

  let aiCommandOutputs: string[] = [];
  let userCommandOutputs: string[] = [];

  rl.prompt();

  rl.on('line', async line => {
    line = line.trim();
    if (!line) {
      rl.prompt();
      return;
    }

    if (line.startsWith('!')) {
      const cmd = line.slice(1);
      try {
        const { stdout, stderr } = await execAsync(cmd);
        const output = stdout + stderr;
        process.stdout.write('\x1b[2m' + output + '\x1b[0m\n');
        userCommandOutputs.push(`\\sh\n${output}\n\\\``);
        await log(`\n$ ${cmd}\n${output}\n`);
      } catch (e: any) {
        const message = e?.message || String(e);
        process.stdout.write('\x1b[2m' + message + '\x1b[0m\n');
        userCommandOutputs.push(message);
        await log(`\n$ ${cmd}\n${message}\n`);
      }
      rl.prompt();
      return;
    }

    const contextParts = [
      ...aiCommandOutputs.map(output => `\\sh\n${output}\n\\\``),
      ...userCommandOutputs,
      line,
    ];
    const fullMessage = contextParts.join('\n');

    await log(`\n> ${line}\n`);
    const response = await chat.ask(fullMessage, { system: SYSTEM_PROMPT });
    await log(response + '\n');

    const runMatches = [...response.matchAll(/<RUN>(.*?)<\/RUN>/gs)];
    aiCommandOutputs = [];

    for (const match of runMatches) {
      const script = match[1].trim();
      const answer = await askQuestion(rl, `\nExecute this command? [Y/n]: `);

      if (answer.toLowerCase() === 'n') {
        continue;
      }

      try {
        const { stdout, stderr } = await execAsync(script);
        const output = stdout + stderr;
        process.stdout.write('\x1b[2m' + output + '\x1b[0m\n');
        aiCommandOutputs.push(output);
        await log(`\n# ${script}\n${output}\n`);
      } catch (e: any) {
        const message = e?.message || String(e);
        process.stdout.write('\x1b[2m' + message + '\x1b[0m\n');
        aiCommandOutputs.push(message);
        await log(`\n# ${script}\n${message}\n`);
      }
    }

    userCommandOutputs = [];
    rl.prompt();
  });

  rl.on('SIGINT', () => {
    rl.close();
  });

  rl.on('close', () => {
    process.stdout.write('\n');
    process.exit(0);
  });
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
