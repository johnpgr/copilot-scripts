import path from "path";
import { appendFile, mkdir } from "fs/promises";

const HOME = process.env.HOME || "";

async function ensureDir(dir: string) {
  await mkdir(dir, { recursive: true });
}

export async function createLogFile(
  tool: string,
  prefix = "conversation",
): Promise<string> {
  const dir = path.join(HOME, `.copilot-scripts/${tool}`);
  await ensureDir(dir);

  const filePath = path.join(dir, `${prefix}_${Date.now()}.txt`);
  await appendFile(filePath, "");
  return filePath;
}

export async function appendLog(
  filePath: string,
  content: string,
): Promise<void> {
  await appendFile(filePath, content);
}
