import path from "path";
import * as Effect from "effect/Effect";
import { FileSystem } from "./FileSystemService.ts";
import { FsError } from "../errors/index.ts";

export interface LogService {
  createLogFile: (
    tool: string,
    prefix?: string,
  ) => Effect.Effect<string, FsError>;
  append: (filePath: string, content: string) => Effect.Effect<void, FsError>;
}

export namespace LogService {
  export function create(fs: FileSystem): LogService {
    const home = process.env.HOME || "";

    const createLogFile: LogService["createLogFile"] = (
      tool,
      prefix = "conversation",
    ) => {
      const dir = fs.join(home, `.copilot-scripts/${tool}`);
      return Effect.flatMap(fs.ensureDir(dir), () => {
        const filePath = path.join(dir, `${prefix}_${Date.now()}.txt`);
        return Effect.flatMap(fs.writeFile(filePath, ""), () =>
          Effect.succeed(filePath),
        );
      });
    };

    const append: LogService["append"] = (filePath, content) =>
      fs.appendFile(filePath, content);

    return {
      createLogFile,
      append,
    };
  }
}
