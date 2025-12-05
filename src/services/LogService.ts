import { Context, Effect, Layer } from "effect";
import path from "path";
import { FileSystemService } from "./FileSystemService.ts";
import { FsError } from "../errors/index.ts";

export interface Logger {
  readonly createLogFile: (
    tool: string,
    prefix?: string,
  ) => Effect.Effect<string, FsError>;
  readonly append: (
    filePath: string,
    content: string,
  ) => Effect.Effect<void, FsError>;
}

export class LogService extends Context.Tag("@app/LogService")<
  LogService,
  Logger
>() {
  static readonly layer = Layer.effect(
    LogService,
    Effect.gen(function* () {
      const fs = yield* FileSystemService;
      const home = process.env.HOME || "";

      const createLogFile = (tool: string, prefix = "conversation") => {
        const dir = fs.join(home, `.copilot-scripts/${tool}`);
        return fs.ensureDir(dir).pipe(
          Effect.flatMap(() => {
            const filePath = path.join(dir, `${prefix}_${Date.now()}.txt`);
            return fs.writeFile(filePath, "").pipe(Effect.as(filePath));
          }),
        );
      };

      const append = (filePath: string, content: string) =>
        fs.appendFile(filePath, content);

      return LogService.of({ createLogFile, append });
    }),
  );
}
