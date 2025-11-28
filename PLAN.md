# copilot-scripts Effect Migration Plan

## Overview

Refactor to use Effect library for robust error handling, composability, resource management.

**Strategy**: Full conversion - all async ops → Effect.Effect, comprehensive Schema validation, abstracted FileSystem.

**Benefits**: Type-safe errors, auto resource cleanup, retry/timeout primitives, dependency injection, testability.

---

## Dependencies

```json
{
  "dependencies": {
    "effect": "^3.10.0",
    "@effect/schema": "^0.75.0",
    "@effect/platform": "^0.67.0",
    "@effect/platform-node": "^0.63.0",
    "gpt-tokenizer": "^2.9.0"
  }
}
```

---

## Architecture

```
Application (chatsh, holefill, refactor)
  ↓
Business Logic (ChatInstance, ModelResolver)
  ↓
Services (CopilotService, AuthService, FileSystemService, LogService)
  ↓
Platform (HttpClient, FileSystem via Effect)
```

---

## Error Taxonomy (`src/errors/index.ts`)

```typescript
import { Data } from "effect"

// Auth
export class TokenValidationError extends Data.TaggedError("TokenValidationError")<{
  field: string; received: unknown
}> {}

export class DeviceFlowError extends Data.TaggedError("DeviceFlowError")<{
  stage: "init" | "poll"; message: string
}> {}

export class AuthTimeoutError extends Data.TaggedError("AuthTimeoutError")<{
  elapsed: number
}> {}

export class BearerTokenError extends Data.TaggedError("BearerTokenError")<{
  status: number; message: string
}> {}

// API
export class ApiError extends Data.TaggedError("ApiError")<{
  status: number; path: string; body: string
}> {}

export class StreamError extends Data.TaggedError("StreamError")<{
  reason: string; path?: string
}> {}

export class ParseError extends Data.TaggedError("ParseError")<{
  input: string; expected: string
}> {}

// FileSystem
export class FileSystemError extends Data.TaggedError("FileSystemError")<{
  operation: "read" | "write" | "mkdir" | "delete"
  path: string; cause?: unknown
}> {}

// Model
export class ModelNotFoundError extends Data.TaggedError("ModelNotFoundError")<{
  spec: string; available: string[]
}> {}

export class ModelCacheError extends Data.TaggedError("ModelCacheError")<{
  reason: string
}> {}

// Tools
export class CommandExecutionError extends Data.TaggedError("CommandExecutionError")<{
  command: string; exitCode?: number; signal?: string; stderr?: string
}> {}

export class HoleFillError extends Data.TaggedError("HoleFillError")<{
  reason: string; file: string
}> {}

export class RefactorError extends Data.TaggedError("RefactorError")<{
  phase: "compact" | "edit" | "apply"; reason: string
}> {}
```

---

## Schemas (`src/schemas/index.ts`)

```typescript
import { Schema as S } from "@effect/schema"

export const TokenCacheSchema = S.Struct({
  oauth_token: S.optional(S.String),
  bearer_token: S.optional(S.String),
  expires_at: S.optional(S.Number)
})

export const DeviceCodeSchema = S.Struct({
  device_code: S.String,
  user_code: S.String,
  verification_uri: S.String,
  interval: S.Number.pipe(S.withDefault(5))
})

export const AccessTokenSchema = S.Struct({
  access_token: S.optional(S.String),
  error: S.optional(S.String)
})

export const BearerTokenSchema = S.Struct({
  token: S.String,
  expires_at: S.Number
})

export const CopilotModelSchema = S.Struct({
  id: S.String,
  name: S.String,
  tokenizer: S.String.pipe(S.withDefault("o200k_base")),
  max_input_tokens: S.Number.pipe(S.withDefault(128000)),
  max_output_tokens: S.Number.pipe(S.withDefault(16384)),
  streaming: S.Boolean.pipe(S.withDefault(false)),
  tools: S.Boolean.pipe(S.withDefault(false)),
  use_responses: S.Boolean.pipe(S.withDefault(false))
})

export const ChatMessageSchema = S.Struct({
  role: S.Literal("system", "user", "assistant"),
  content: S.String
})
```

---

## Migration Checklist

### Phase 1: Foundation
- [ ] Add Effect dependencies to package.json
- [ ] Create `src/errors/index.ts` with tagged errors
- [ ] Create `src/schemas/index.ts` with schemas
- [ ] Create `src/services/FileSystemService.ts`

### Phase 2: Core Services
- [ ] Create `src/services/AuthService.ts`
- [ ] Create `src/services/CopilotService.ts`
- [ ] Create `src/services/LogService.ts`
- [ ] Delete old: auth/token-store.ts, auth/copilot-auth.ts, utils/logger.ts

### Phase 3: API & Streaming
- [ ] Migrate `src/api/models.ts` to use CopilotService
- [ ] Migrate `src/api/chat.ts` to use Stream
- [ ] Delete old: utils/streaming.ts

### Phase 4: Business Logic
- [ ] Migrate `src/core/model-resolver.ts` with Effect Cache
- [ ] Migrate `src/core/chat-instance.ts`
- [ ] Migrate `src/utils/tokenizer.ts`

### Phase 5: Tools
- [ ] Migrate `src/tools/chatsh.ts` to Effect
- [ ] Implement `src/tools/holefill.ts` with Effect
- [ ] Implement `src/tools/refactor.ts` with Effect
- [ ] Create `src/runtime.ts` for shared layer config

### Phase 6: Finalize
- [ ] Update `src/index.ts` exports
- [ ] Create build.ts for executables
- [ ] Update README with Effect patterns

---

## Key Patterns

**Service Definition**:
```typescript
class MyService extends Context.Tag("MyService")<
  MyService,
  { readonly op: (arg: string) => Effect.Effect<Result, MyError> }
>() {}
```

**Resource Management**:
```typescript
Effect.acquireRelease(
  acquire: Effect<Resource, E, R>,
  release: (r: Resource) => Effect<void, never, R>
)
```

**Error Handling**:
```typescript
effect.pipe(
  Effect.catchTag("MyError", error => handleError(error))
)
```

---

Full service implementations in `/home/joao/.claude/plans/elegant-churning-cloud.md`.
