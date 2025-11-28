import { access, appendFile, mkdir, readFile, writeFile } from "fs/promises";
import { constants } from "fs";
import path from "path";
import * as Effect from "effect/Effect";
import { FsError } from "../errors";

export interface FileSystem {
  readFile: (
    filePath: string,
    encoding?: BufferEncoding,
  ) => Effect.Effect<string, FsError>;
  writeFile: (
    filePath: string,
    contents: string,
  ) => Effect.Effect<void, FsError>;
  appendFile: (
    filePath: string,
    contents: string,
  ) => Effect.Effect<void, FsError>;
  ensureDir: (dirPath: string) => Effect.Effect<void, FsError>;
  exists: (filePath: string) => Effect.Effect<boolean, never>;
  join: (...segments: string[]) => string;
}

export namespace FileSystem {
  export function create(): FileSystem {
    return {
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
        Effect.tryPromise({
          try: async () => {
            try {
              await access(filePath, constants.F_OK);
              return true;
            } catch {
              return false;
            }
          },
          catch: () => false,
        }).pipe(Effect.orElseSucceed(() => false)),

      join: (...segments: string[]) => path.join(...segments),
    };
  }
}
