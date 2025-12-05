## Effect Basics

Guidelines for structuring basic Effect code: sequencing with `Effect.gen` and naming effectful functions with `Effect.fn`.

### Effect.gen

Just as `async/await` provides sequential, readable way to work with `Promise` values, `Effect.gen` and `yield*` provide the same for `Effect` values:

```typescript
import { Effect } from "effect"

const program = Effect.gen(function* () {
  const data = yield* fetchData
  yield* Effect.logInfo(`Processing data: ${data}`)
  return yield* processData(data)
})
```

### Effect.fn

Use `Effect.fn` with generator functions for traced, named effects. Traces where the function is called from, not just where it's defined:

```typescript
import { Effect } from "effect"

const processUser = Effect.fn("processUser")(function* (userId: string) {
  yield* Effect.logInfo(`Processing user ${userId}`)
  const user = yield* getUser(userId)
  return yield* processData(user)
})
```

**Benefits:**
- Call-site tracing for each invocation
- Stack traces with location details
- Clean signatures
- Spans integrate with telemetry

### Pipe for Instrumentation

Use `.pipe()` to add cross-cutting concerns: timeouts, retries, logging, annotations:

```typescript
import { Effect, Schedule } from "effect"

const program = fetchData.pipe(
  Effect.timeout("5 seconds"),
  Effect.retry(Schedule.exponential("100 millis").pipe(Schedule.compose(Schedule.recurs(3)))),
  Effect.tap((data) => Effect.logInfo(`Fetched: ${data}`)),
  Effect.withSpan("fetchData")
)
```

**Common instrumentation:**
- `Effect.timeout` - fail if effect takes too long
- `Effect.retry` - retry on failure with a schedule
- `Effect.tap` - run side effect without changing value
- `Effect.withSpan` - add tracing span

### Retry and Timeout

Combine retry and timeout for production resilience:

```typescript
import { Effect, Schedule } from "effect"

const retryPolicy = Schedule.exponential("100 millis").pipe(
  Schedule.compose(Schedule.recurs(3))
)

const resilientCall = callExternalApi.pipe(
  Effect.timeout("2 seconds"),     // per-attempt timeout
  Effect.retry(retryPolicy),        // retry failed attempts
  Effect.timeout("10 seconds")      // overall timeout
)
```

**Schedule combinators:**
- `Schedule.exponential` - exponential backoff
- `Schedule.recurs` - limit retry count
- `Schedule.spaced` - fixed delay between retries
- `Schedule.compose` - combine schedules

### Edge-of-World Execution

Only run Effects (via `Effect.runPromise`, `Effect.runSync`) at application entry points. Keep core logic pure:

```typescript
// In CLI handler or route handler
const main = program.pipe(Effect.provide(appLayer))
Effect.runPromise(main)
```
