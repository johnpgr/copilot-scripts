import * as Effect from "effect/Effect";
import * as Stream from "effect/Stream";
import { AuthService } from "./AuthService.ts";
import { ApiError, AuthError, FsError, ParseError } from "../errors/index.ts";
import { parseSSEStream } from "../utils/streaming.ts";

const COPILOT_HEADERS = {
  "Editor-Version": `Bun/${Bun.version}`,
  "Editor-Plugin-Version": "copilot-scripts/0.1.0",
  "Copilot-Integration-Id": "vscode-chat",
};

export interface CopilotService {
  request: <T>(
    method: "GET" | "POST",
    path: string,
    body?: unknown,
  ) => Effect.Effect<T, ApiError | AuthError | FsError | ParseError>;
  stream: (
    path: string,
    body: unknown,
  ) => Stream.Stream<any, ApiError | AuthError | FsError | ParseError>;
}

export namespace CopilotService {
  export function create(auth: AuthService): CopilotService {
    const getHeaders = (token: string, extra: Record<string, string> = {}) => ({
      Authorization: `Bearer ${token}`,
      ...COPILOT_HEADERS,
      ...extra,
    });

    const request = <T>(method: "GET" | "POST", path: string, body?: unknown) =>
      Effect.gen(function* (_) {
        const token = yield* _(auth.getBearerToken());
        const response = yield* _(
          Effect.tryPromise({
            try: () =>
              fetch(`https://api.githubcopilot.com${path}`, {
                method,
                headers: getHeaders(token, {
                  "Content-Type": "application/json",
                }),
                ...(body ? { body: JSON.stringify(body) } : {}),
              }),
            catch: (err) => new ApiError(String(err)),
          }),
        );

        if (!response.ok) {
          const message = yield* _(
            Effect.tryPromise({
              try: () => response.text(),
              catch: (err) => new ApiError(String(err)),
            }),
          );
          return yield* _(
            Effect.fail(
              new ApiError(`API error ${response.status}: ${message}`),
            ),
          );
        }

        return (yield* _(
          Effect.tryPromise({
            try: () => response.json() as Promise<T>,
            catch: (err) => new ParseError(String(err)),
          }),
        )) as T;
      });

    const stream: CopilotService["stream"] = (path, body) =>
      Stream.unwrap(
        Effect.gen(function* (_) {
          const token = yield* _(auth.getBearerToken());
          const response = yield* _(
            Effect.tryPromise({
              try: () =>
                fetch(`https://api.githubcopilot.com${path}`, {
                  method: "POST",
                  headers: getHeaders(token, { "Content-Type": "application/json" }),
                  body: JSON.stringify(body),
                }),
              catch: (err) => new ApiError(String(err)),
            }),
          );
          if (!response.ok) {
            const message = yield* _(
              Effect.tryPromise({
                try: () => response.text(),
                catch: (err) => new ApiError(String(err)),
              }),
            );
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

    return { request, stream };
  }
}
