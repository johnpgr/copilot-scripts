import path from "path";
import * as Effect from "effect/Effect";
import * as Duration from "effect/Duration";
import { FileSystem } from "./FileSystemService";
import { AccessToken, BearerToken, DeviceCode, TokenCache } from "../schemas";
import { ApiError, AuthError, FsError, ParseError } from "../errors";

export interface AuthService {
  getBearerToken: () => Effect.Effect<
    string,
    AuthError | ApiError | FsError | ParseError
  >;
}

export namespace AuthService {
  const CONFIG_DIR = ".config/copilot-scripts";
  const TOKEN_FILE = "tokens.json";
  const CLIENT_ID = "Iv1.b507a08c87ecfe98";

  const loadCache = (fs: FileSystem) =>
    Effect.gen(function* (_) {
      const tokenPath = fs.join(process.env.HOME || "", CONFIG_DIR, TOKEN_FILE);
      const exists = yield* _(fs.exists(tokenPath));
      if (!exists) return null;

      const text = yield* _(fs.readFile(tokenPath));
      const raw = yield* _(
        Effect.try({
          try: () => JSON.parse(text),
          catch: (err) => new ParseError(String(err)),
        }),
      );
      const cache = yield* _(TokenCache.fromJson(raw));
      return cache;
    }).pipe(Effect.catchAll(() => Effect.succeed(null)));

  const saveCache = (fs: FileSystem, cache: TokenCache) =>
    Effect.gen(function* (_) {
      const baseDir = fs.join(process.env.HOME || "", CONFIG_DIR);
      yield* _(fs.ensureDir(baseDir));
      const tokenPath = path.join(baseDir, TOKEN_FILE);
      const payload = JSON.stringify(cache, null, 2);
      yield* _(fs.writeFile(tokenPath, payload));
    });

  const findExistingToken = (fs: FileSystem) =>
    Effect.gen(function* (_) {
      const home = process.env.HOME || "";
      const configPaths = [
        fs.join(home, ".config/github-copilot/hosts.json"),
        fs.join(home, ".config/github-copilot/apps.json"),
      ];

      for (const configPath of configPaths) {
        const exists = yield* _(fs.exists(configPath));
        if (!exists) continue;

        const text = yield* _(fs.readFile(configPath));
        const raw = yield* _(
          Effect.try({
            try: () => JSON.parse(text),
            catch: (err) => new ParseError(String(err)),
          }),
        ).pipe(Effect.catchAll(() => Effect.succeed({} as any)));

        for (const [key, value] of Object.entries<any>(raw)) {
          if (key.includes("github.com") && value?.oauth_token) {
            return value.oauth_token as string;
          }
        }
      }

      return null;
    }).pipe(Effect.catchAll(() => Effect.succeed(null)));

  const deviceFlow = () =>
    Effect.gen(function* (_) {
      const response = yield* _(
        Effect.tryPromise({
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
        }),
      );

      if (!response.ok) {
        return yield* _(
          Effect.fail(
            new AuthError(`Failed to start device flow: ${response.status}`),
          ),
        );
      }

      const device = yield* _(
        Effect.tryPromise({
          try: () => response.json(),
          catch: (err) => new ParseError(String(err)),
        }).pipe(Effect.flatMap((json) => DeviceCode.fromJson(json))),
      );

      console.log(
        `\nVisit ${device.verificationUri} and enter code: ${device.userCode}\n`,
      );
      console.log("Waiting for authorization...");

      const poll = (): Effect.Effect<
        string,
        AuthError | ApiError | ParseError
      > =>
        Effect.gen(function* (_) {
          const pollResponse = yield* _(
            Effect.tryPromise({
              try: () =>
                fetch("https://github.com/login/oauth/access_token", {
                  method: "POST",
                  headers: { Accept: "application/json" },
                  body: JSON.stringify({
                    client_id: CLIENT_ID,
                    device_code: device.deviceCode,
                    grant_type: "urn:ietf:params:oauth:grant-type:device_code",
                  }),
                }),
              catch: (err) => new ApiError(String(err)),
            }),
          );

          if (!pollResponse.ok) {
            return yield* _(
              Effect.fail(new AuthError(`Auth error: ${pollResponse.status}`)),
            );
          }

          const data = yield* _(
            Effect.tryPromise({
              try: () => pollResponse.json(),
              catch: (err) => new ParseError(String(err)),
            }).pipe(Effect.flatMap((json) => AccessToken.fromJson(json))),
          );

          if (data.accessToken) return data.accessToken;
          if (data.error && data.error !== "authorization_pending") {
            return yield* _(
              Effect.fail(new AuthError(`Auth error: ${data.error}`)),
            );
          }

          yield* _(Effect.sleep(Duration.seconds(device.interval ?? 5)));
          return yield* _(poll());
        });

      return yield* _(poll());
    });

  const getBearerToken = (oauthToken: string) =>
    Effect.gen(function* (_) {
      const response = yield* _(
        Effect.tryPromise({
          try: () =>
            fetch("https://api.github.com/copilot_internal/v2/token", {
              headers: { Authorization: `Token ${oauthToken}` },
            }),
          catch: (err) => new ApiError(String(err)),
        }),
      );

      if (!response.ok) {
        return yield* _(
          Effect.fail(
            new ApiError(`Failed to get bearer token: ${response.status}`),
          ),
        );
      }

      const data = yield* _(
        Effect.tryPromise({
          try: () => response.json(),
          catch: (err) => new ParseError(String(err)),
        }).pipe(Effect.flatMap((json) => BearerToken.fromJson(json))),
      );

      return data;
    });

  export function create(fs: FileSystem): AuthService {
    const getBearerTokenEffect: AuthService["getBearerToken"] = () =>
      Effect.gen(function* (_) {
        const cached = yield* _(loadCache(fs));
        const nowSeconds = Date.now() / 1000;
        if (
          cached?.bearerToken &&
          cached?.expiresAt &&
          cached.expiresAt > nowSeconds
        ) {
          return cached.bearerToken;
        }

        let oauthToken: string | undefined = cached?.oauthToken ?? undefined;
        if (!oauthToken) {
          const existing = yield* _(findExistingToken(fs));
          if (existing) oauthToken = existing;
        }
        if (!oauthToken) {
          oauthToken = yield* _(deviceFlow());
          yield* _(saveCache(fs, new TokenCache(oauthToken)));
        }

        const bearer = yield* _(getBearerToken(oauthToken));
        yield* _(
          saveCache(
            fs,
            new TokenCache(oauthToken, bearer.token, bearer.expiresAt),
          ),
        );
        return bearer.token;
      });

    return { getBearerToken: getBearerTokenEffect };
  }
}
