import { Context, Effect, Layer } from "effect";
import { access, appendFile, mkdir, readFile, writeFile } from "fs/promises";
import { constants } from "fs";
import path from "path";
import { FsError } from "../errors/index.ts";

export interface FileSystem {
  readonly readFile: (
    filePath: string,
    encoding?: BufferEncoding,
  ) => Effect.Effect<string, FsError>;
  readonly writeFile: (
    filePath: string,
    contents: string,
  ) => Effect.Effect<void, FsError>;
  readonly appendFile: (
    filePath: string,
    contents: string,
  ) => Effect.Effect<void, FsError>;
  readonly ensureDir: (dirPath: string) => Effect.Effect<void, FsError>;
  readonly exists: (filePath: string) => Effect.Effect<boolean>;
  readonly join: (...segments: string[]) => string;
}

export class FileSystemService extends Context.Tag("@app/FileSystemService")<
  FileSystemService,
  FileSystem
>() {
  static readonly layer = Layer.succeed(
    FileSystemService,
    FileSystemService.of({
      readFile: (filePath, encoding = "utf8") =>
        Effect.tryPromise({
          try: () => readFile(filePath, { encoding }) as Promise<string>,
          catch: (err) => new FsError(String(err)),
        }),

      writeFile: (filePath, contents) =>
        Effect.tryPromise({
          try: () => writeFile(filePath, contents),
          catch: (err) => new FsError(String(err)),
        }),

      appendFile: (filePath, contents) =>
        Effect.tryPromise({
          try: () => appendFile(filePath, contents),
          catch: (err) => new FsError(String(err)),
        }),

      ensureDir: (dirPath) =>
        Effect.tryPromise({
          try: () => mkdir(dirPath, { recursive: true }),
          catch: (err) => new FsError(String(err)),
        }),

      exists: (filePath) =>
        Effect.tryPromise(() => access(filePath, constants.F_OK)).pipe(
          Effect.as(true),
          Effect.catchAll(() => Effect.succeed(false)),
        ),

      join: (...segments: string[]) => path.join(...segments),
    }),
  );
}
