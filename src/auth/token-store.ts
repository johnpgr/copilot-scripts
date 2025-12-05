import { Context, Effect, Layer, Option, Schema } from "effect";
import { FileSystemService } from "../services/FileSystemService.ts";
import { TokenCacheSchema } from "../schemas/index.ts";
import { FsError, ParseError } from "../errors/index.ts";

export interface TokenStorage {
  readonly load: () => Effect.Effect<
    Option.Option<TokenCacheSchema>,
    FsError | ParseError
  >;
  readonly saveOAuthToken: (
    token: string,
  ) => Effect.Effect<void, FsError | ParseError>;
  readonly saveBearerToken: (
    token: string,
    expiresAt: number,
  ) => Effect.Effect<void, FsError | ParseError>;
}

export class TokenStore extends Context.Tag("@app/TokenStore")<
  TokenStore,
  TokenStorage
>() {
  static readonly layer = Layer.effect(
    TokenStore,
    Effect.gen(function* () {
      const fs = yield* FileSystemService;
      const homeDir = process.env.HOME || "";
      const configDir = fs.join(homeDir, ".config", "copilot-scripts");
      const tokenPath = fs.join(configDir, "tokens.json");

      const ensureConfigDir = fs.ensureDir(configDir);

      const load = () =>
        Effect.gen(function* () {
          const exists = yield* fs.exists(tokenPath);
          if (!exists) return Option.none();

          const content = yield* fs.readFile(tokenPath);
          const jsonSchema = Schema.parseJson(TokenCacheSchema);

          const data = yield* Schema.decodeUnknown(jsonSchema)(content).pipe(
            Effect.mapError((e) => new ParseError(String(e))),
          );
          return Option.some(data);
        });

      const save = (updater: (prev: TokenCacheSchema) => TokenCacheSchema) =>
        Effect.gen(function* () {
          yield* ensureConfigDir;
          const current = yield* load().pipe(
            Effect.catchTag("ParseError", () =>
              Effect.succeed(Option.none()),
            ),
            Effect.catchTag("FsError", () => Effect.succeed(Option.none())),
          );

          const empty = new TokenCacheSchema({});
          const prev = Option.getOrElse(current, () => empty);
          const next = updater(prev);

          const json = yield* Schema.encode(Schema.parseJson(TokenCacheSchema))(next).pipe(
            Effect.mapError((e) => new ParseError(String(e))),
          );

          yield* fs.writeFile(tokenPath, json);
        });

      const saveOAuthToken = (token: string) =>
        save((prev) => new TokenCacheSchema({ ...prev, oauth_token: token }));

      const saveBearerToken = (token: string, expiresAt: number) =>
        save((prev) =>
          new TokenCacheSchema({
            ...prev,
            bearer_token: token,
            expires_at: expiresAt,
          }),
        );

      return TokenStore.of({ load, saveOAuthToken, saveBearerToken });
    }),
  );
}