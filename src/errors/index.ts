export class AuthError extends Error {
  readonly _tag = "AuthError";
  constructor(message: string) {
    super(message);
  }
}

export class ApiError extends Error {
  readonly _tag = "ApiError";
  constructor(message: string) {
    super(message);
  }
}

export class FsError extends Error {
  readonly _tag = "FsError";
  constructor(message: string) {
    super(message);
  }
}

export class ParseError extends Error {
  readonly _tag = "ParseError";
  constructor(message: string) {
    super(message);
  }
}

export class HighlightError extends Error {
  readonly _tag = "HighlightError";
  constructor(message: string) {
    super(message);
  }
}

export type AppError = AuthError | ApiError | FsError | ParseError | HighlightError;
