## Error Handling

Effect provides structured error handling with Schema integration for serializable, type-safe errors.

### Schema.TaggedError

Define domain errors with `Schema.TaggedError`:

```typescript
import { Schema } from "effect"

class ValidationError extends Schema.TaggedError<ValidationError>()(
  "ValidationError",
  {
    field: Schema.String,
    message: Schema.String,
  }
) {}

class NotFoundError extends Schema.TaggedError<NotFoundError>()(
  "NotFoundError",
  {
    resource: Schema.String,
    id: Schema.String,
  }
) {}

// Union for grouped handling
const AppError = Schema.Union(ValidationError, NotFoundError)
type AppError = typeof AppError.Type
```

**Benefits:**
- Serializable (network/DB safe)
- Type-safe with built-in `_tag`
- Custom methods via class
- Sensible default `message`

### Yieldable Errors

`Schema.TaggedError` creates yieldable errors - use directly without `Effect.fail()`:

```typescript
// Good: direct use
return error.response.status === 404
  ? UserNotFoundError.make({ id })
  : Effect.die(error)

// Redundant: no need to wrap
return error.response.status === 404
  ? Effect.fail(UserNotFoundError.make({ id }))  // unnecessary
  : Effect.die(error)
```

### Recovering from Errors

#### catchAll - Handle all errors

```typescript
const recovered = program.pipe(
  Effect.catchAll((error) =>
    Effect.gen(function* () {
      yield* Effect.logError("Error occurred", error)
      return `Recovered from ${error._tag}`
    })
  )
)
```

#### catchTag - Handle specific error by tag

```typescript
const recovered = program.pipe(
  Effect.catchTag("HttpError", (error) =>
    Effect.gen(function* () {
      yield* Effect.logWarning(`HTTP ${error.statusCode}: ${error.message}`)
      return "Recovered from HttpError"
    })
  )
)
```

#### catchTags - Handle multiple error types

```typescript
const recovered = program.pipe(
  Effect.catchTags({
    HttpError: () => Effect.succeed("Recovered from HttpError"),
    ValidationError: () => Effect.succeed("Recovered from ValidationError")
  })
)
```

### Expected Errors vs Defects

**Use typed errors** for domain failures the caller can handle:
- Validation errors
- "Not found"
- Permission denied
- Rate limits

**Use defects** for unrecoverable situations:
- Bugs and invariant violations
- Missing required config at startup

```typescript
// At app entry: if config fails, nothing can proceed
const main = Effect.gen(function* () {
  const config = yield* loadConfig.pipe(Effect.orDie)
  yield* Effect.log(`Starting on port ${config.port}`)
})
```

**When to catch defects:** Almost never. Only at system boundaries for logging/diagnostics.

### Schema.Defect - Wrapping Unknown Errors

Use `Schema.Defect` to wrap unknown errors from external libraries:

```typescript
import { Schema, Effect } from "effect"

class ApiError extends Schema.TaggedError<ApiError>()(
  "ApiError",
  {
    endpoint: Schema.String,
    statusCode: Schema.Number,
    error: Schema.Defect,  // wraps unknown error
  }
) {}

const fetchUser = (id: string) =>
  Effect.tryPromise({
    try: () => fetch(`/api/users/${id}`).then((r) => r.json()),
    catch: (error) => ApiError.make({
      endpoint: `/api/users/${id}`,
      statusCode: 500,
      error
    })
  })
```

**Schema.Defect handles:**
- JavaScript `Error` instances -> `{ name, message }` objects
- Any unknown value -> string representation
- Serializable for network/storage
