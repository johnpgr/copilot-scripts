import { Context, Effect, Layer, Stream } from "effect";
import { AuthService } from "./AuthService.ts";
import { ApiError, AuthError, FsError, ParseError } from "../errors/index.ts";
import { parseSSEStream } from "../utils/streaming.ts";

const runtime =
  typeof Bun !== "undefined" ? `Bun/${Bun.version}` : `Node/${process.version}`;

const COPILOT_HEADERS = {
  "Editor-Version": runtime,
  "Editor-Plugin-Version": "copilot-scripts/0.1.0",
  "Copilot-Integration-Id": "vscode-chat",
};

export interface Copilot {
  readonly request: <T>(
    method: "GET" | "POST",
    path: string,
    body?: unknown,
  ) => Effect.Effect<T, ApiError | AuthError | FsError | ParseError>;
  readonly stream: (
    path: string,
    body: unknown,
  ) => Stream.Stream<any, ApiError | AuthError | FsError | ParseError>;
}

export class CopilotService extends Context.Tag("@app/CopilotService")<
  CopilotService,
  Copilot
>() {
  static readonly layer = Layer.effect(
    CopilotService,
    Effect.gen(function* () {
      const auth = yield* AuthService;

      const getHeaders = (
        token: string,
        extra: Record<string, string> = {},
      ) => ({
        Authorization: `Bearer ${token}`,
        ...COPILOT_HEADERS,
        ...extra,
      });

      const request = <T>(method: "GET" | "POST", path: string, body?: unknown) =>
        Effect.gen(function* () {
          const token = yield* auth.getBearerToken();
          const response = yield* Effect.tryPromise({
            try: () =>
              fetch(`https://api.githubcopilot.com${path}`, {
                method,
                headers: getHeaders(token, {
                  "Content-Type": "application/json",
                }),
                body: body ? JSON.stringify(body) : undefined,
              } as RequestInit),
            catch: (err) => new ApiError(String(err)),
          });

          if (!response.ok) {
            const message = yield* Effect.tryPromise({
              try: () => response.text(),
              catch: (err) => new ApiError(String(err)),
            });
            return yield* Effect.fail(
              new ApiError(`API error ${response.status}: ${message}`),
            );
          }

          return (yield* Effect.tryPromise({
            try: () => response.json() as Promise<T>,
            catch: (err) => new ParseError(String(err)),
          })) as T;
        });

      const stream: Copilot["stream"] = (path, body) =>
        Stream.unwrap(
          Effect.gen(function* () {
            const token = yield* auth.getBearerToken();
            const response = yield* Effect.tryPromise({
              try: () =>
                fetch(`https://api.githubcopilot.com${path}`, {
                  method: "POST",
                  headers: getHeaders(token, {
                    "Content-Type": "application/json",
                  }),
                  body: JSON.stringify(body),
                } as RequestInit),
              catch: (err) => new ApiError(String(err)),
            });
            if (!response.ok) {
              const message = yield* Effect.tryPromise({
                try: () => response.text(),
                catch: (err) => new ApiError(String(err)),
              });
              return Stream.fail(
                new ApiError(`Stream error ${response.status}: ${message}`),
              );
            }
            return Stream.mapError(
              parseSSEStream(response),
              (err) => err as AuthError | ApiError | FsError | ParseError,
            );
          }),
        );

      return CopilotService.of({ request, stream });
    }),
  );
}