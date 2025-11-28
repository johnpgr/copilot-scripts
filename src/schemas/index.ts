import * as S from "@effect/schema/Schema";
import * as Effect from "effect/Effect";
import { ParseError } from "../errors";

const format = (err: unknown) =>
  typeof err === "string" ? err : JSON.stringify(err);

export class DeviceCode {
  constructor(
    public device_code: string,
    public user_code: string,
    public verification_uri: string,
    public interval: number,
  ) {}

  static Schema = S.Struct({
    device_code: S.String,
    user_code: S.String,
    verification_uri: S.String,
    interval: S.optional(S.Number),
  });

  static fromJson(data: unknown) {
    return Effect.map(
      Effect.mapError(
        S.decodeUnknown(DeviceCode.Schema)(data),
        (err) => new ParseError(format(err)),
      ),
      (parsed: any) =>
        new DeviceCode(
          parsed.device_code,
          parsed.user_code,
          parsed.verification_uri,
          parsed.interval ?? 5,
        ),
    );
  }
}

export class AccessToken {
  constructor(
    public access_token?: string,
    public error?: string,
  ) {}

  static Schema = S.Struct({
    access_token: S.optional(S.String),
    error: S.optional(S.String),
  });

  static fromJson(data: unknown) {
    return Effect.map(
      Effect.mapError(
        S.decodeUnknown(AccessToken.Schema)(data),
        (err) => new ParseError(format(err)),
      ),
      (parsed: any) => new AccessToken(parsed.access_token, parsed.error),
    );
  }
}

export class BearerToken {
  constructor(
    public token: string,
    public expires_at: number,
  ) {}

  static Schema = S.Struct({
    token: S.String,
    expires_at: S.Number,
  });

  static fromJson(data: unknown) {
    return Effect.map(
      Effect.mapError(
        S.decodeUnknown(BearerToken.Schema)(data),
        (err) => new ParseError(format(err)),
      ),
      (parsed: any) => new BearerToken(parsed.token, parsed.expires_at),
    );
  }
}

export class TokenCache {
  constructor(
    public oauth_token?: string,
    public bearer_token?: string,
    public expires_at?: number,
  ) {}

  static Schema = S.Struct({
    oauth_token: S.optional(S.String),
    bearer_token: S.optional(S.String),
    expires_at: S.optional(S.Number),
  });

  static fromJson(data: unknown) {
    return Effect.map(
      Effect.mapError(
        S.decodeUnknown(TokenCache.Schema)(data),
        (err) => new ParseError(format(err)),
      ),
      (parsed: any) =>
        new TokenCache(
          parsed.oauth_token,
          parsed.bearer_token,
          parsed.expires_at,
        ),
    );
  }
}
