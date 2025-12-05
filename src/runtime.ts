import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { FileSystemService } from "./services/FileSystemService.ts";
import { LogService } from "./services/LogService.ts";
import { AuthService } from "./services/AuthService.ts";
import { CopilotService } from "./services/CopilotService.ts";
import { TokenStore } from "./auth/token-store.ts";

export const AppLayer = Layer.mergeAll(
  CopilotService.layer,
  LogService.layer,
).pipe(
  Layer.provideMerge(AuthService.layer),
  Layer.provideMerge(TokenStore.layer),
  Layer.provideMerge(FileSystemService.layer),
);

export type AppDeps =
  | CopilotService
  | LogService
  | AuthService
  | TokenStore
  | FileSystemService;

export const runMain = <E, A>(program: Effect.Effect<A, E, AppDeps>) =>
  Effect.runPromise(program.pipe(Effect.provide(AppLayer)));
