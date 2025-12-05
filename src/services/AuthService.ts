import { Context, Effect, Layer, Option, Schedule, Schema } from "effect";
import * as Duration from "effect/Duration";
import { FileSystemService } from "./FileSystemService.ts";
import { TokenStore } from "../auth/token-store.ts";
import {
  AccessTokenResponse,
  BearerTokenResponse,
  DeviceCodeResponse,
} from "../schemas/index.ts";
import { ApiError, AuthError, FsError, ParseError } from "../errors/index.ts";

const CLIENT_ID = "Iv1.b507a08c87ecfe98";

export interface Auth {
  readonly getBearerToken: () => Effect.Effect<
    string,
    AuthError | ApiError | FsError | ParseError
  >;
}

export class AuthService extends Context.Tag("@app/AuthService")< 
  AuthService,
  Auth
>() {
  static readonly layer = Layer.effect(
    AuthService,
    Effect.gen(function* () {
      const fs = yield* FileSystemService;
      const tokenStore = yield* TokenStore;

      const findExistingToken = Effect.gen(function* () {
        const home = process.env.HOME || "";
        const configPaths = [
          fs.join(home, ".config/github-copilot/hosts.json"),
          fs.join(home, ".config/github-copilot/apps.json"),
        ];

        for (const configPath of configPaths) {
          const exists = yield* fs.exists(configPath);
          if (!exists) continue;

          const text = yield* fs.readFile(configPath);
          const raw = yield* Effect.try({
            try: () => JSON.parse(text),
            catch: () => new ParseError("Failed to parse config"),
          }).pipe(Effect.catchAll(() => Effect.succeed({} as any)));

          for (const [key, value] of Object.entries<any>(raw)) {
            if (key.includes("github.com") && value?.oauth_token) {
              return value.oauth_token as string;
            }
          }
        }
        return null;
      });

      const deviceFlow = Effect.gen(function* () {
        const response = yield* Effect.tryPromise({
          try: () =>
            fetch("https://github.com/login/device/code", {
              method: "POST",
              headers: {
                Accept: "application/json",
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ client_id: CLIENT_ID, scope: "" }),
            }),
          catch: (err) => new AuthError(String(err)),
        });

        if (!response.ok) {
          return yield* Effect.fail(
            new AuthError(`Failed to start device flow: ${response.status}`),
          );
        }

        const json = yield* Effect.tryPromise({
          try: () => response.json(),
          catch: (e) => new ParseError(String(e)),
        });
        const device = yield* Schema.decodeUnknown(DeviceCodeResponse)(json).pipe(
          Effect.mapError((e) => new ParseError(String(e))),
        );

        console.log(
          `\nVisit ${device.verification_uri} and enter code: ${device.user_code}\n`,
        );
        console.log("Waiting for authorization...");

        const poll = Effect.gen(function* () {
          const pollRes = yield* Effect.tryPromise({
            try: () =>
              fetch("https://github.com/login/oauth/access_token", {
                method: "POST",
                headers: { Accept: "application/json" },
                body: JSON.stringify({
                  client_id: CLIENT_ID,
                  device_code: device.device_code,
                  grant_type: "urn:ietf:params:oauth:grant-type:device_code",
                }),
              }),
            catch: (e) => new ApiError(String(e)),
          });

          if (!pollRes.ok) {
            return yield* Effect.fail(new AuthError(`Auth error: ${pollRes.status}`));
          }

          const pollJson = yield* Effect.tryPromise({
            try: () => pollRes.json(),
            catch: (e) => new ParseError(String(e)),
          });
          const data = yield* Schema.decodeUnknown(AccessTokenResponse)(pollJson).pipe(
            Effect.mapError((e) => new ParseError(String(e))),
          );

          if (data.access_token) return data.access_token;

          if (data.error === "authorization_pending") {
            return yield* Effect.fail(new AuthError("authorization_pending"));
          }

          return yield* Effect.fail(
            new AuthError(
              `Auth error: ${data.error_description || data.error}`,
            ),
          );
        });

        const policy = Schedule.spaced(Duration.seconds(device.interval));

        return yield* poll.pipe(
          Effect.retry({
            while: (err) =>
              err instanceof AuthError &&
              err.message === "authorization_pending",
            schedule: policy,
          }),
        );
      });

      const fetchBearerToken = (oauthToken: string) =>
        Effect.gen(function* () {
          const res = yield* Effect.tryPromise({
            try: () =>
              fetch("https://api.github.com/copilot_internal/v2/token", {
                headers: { Authorization: `Token ${oauthToken}` },
              }),
            catch: (e) => new ApiError(String(e)),
          });

          if (!res.ok)
            return yield* Effect.fail(
              new ApiError(`Failed to get bearer: ${res.status}`),
            );

          const json = yield* Effect.tryPromise({
            try: () => res.json(),
            catch: (e) => new ParseError(String(e)),
          });
          return yield* Schema.decodeUnknown(BearerTokenResponse)(json).pipe(
            Effect.mapError((e) => new ParseError(String(e))),
          );
        });

      const getBearerToken = () =>
        Effect.gen(function* () {
          const cachedOpt = yield* tokenStore.load();
          const cached = Option.getOrNull(cachedOpt);
          const now = Date.now() / 1000;

          if (
            cached?.bearer_token &&
            cached?.expires_at &&
            cached.expires_at > now
          ) {
            return cached.bearer_token;
          }

          let oauthToken = cached?.oauth_token;

          if (!oauthToken) {
            const existing = yield* findExistingToken;
            if (existing) oauthToken = existing;
          }

          if (!oauthToken) {
            oauthToken = yield* deviceFlow;
            yield* tokenStore.saveOAuthToken(oauthToken);
          }

          const bearer = yield* fetchBearerToken(oauthToken);
          yield* tokenStore.saveBearerToken(bearer.token, bearer.expires_at);

          return bearer.token;
        });

      return AuthService.of({ getBearerToken });
    }),
  );
}