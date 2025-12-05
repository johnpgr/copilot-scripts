import * as Effect from "effect/Effect";
import { FileSystem } from "./services/FileSystemService.ts";
import { LogService } from "./services/LogService.ts";
import { AuthService } from "./services/AuthService.ts";
import { CopilotService } from "./services/CopilotService.ts";

export interface RuntimeServices {
  fs: FileSystem;
  log: LogService;
  auth: AuthService;
  copilot: CopilotService;
}

export namespace RuntimeServices {
  export function create(): RuntimeServices {
    const fs = FileSystem.create();
    const log = LogService.create(fs);
    const auth = AuthService.create(fs);
    const copilot = CopilotService.create(auth);

    return {
      fs,
      log,
      auth,
      copilot,
    };
  }
}

export const runMain = <E, A>(program: Effect.Effect<A, E>) =>
  Effect.runPromise(program);
