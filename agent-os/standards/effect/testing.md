## Testing Effect Code

`@effect/vitest` provides enhanced testing support for Effect code with native Effect execution, scoped resources, and detailed fiber failure reporting.

### Why @effect/vitest?

- **Native Effect support**: Run Effects directly with `it.effect()`
- **Automatic cleanup**: `it.scoped()` manages resource lifecycles
- **Test services**: TestClock, TestRandom for deterministic tests
- **Better errors**: Full fiber dumps with causes, spans, and logs
- **Layer support**: Provide dependencies with `Effect.provide()`

### Setup

```bash
bun add -D vitest @effect/vitest
```

```typescript
// vitest.config.ts
import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    include: ["**/*.test.ts"],
  },
})
```

### Basic Test Structure

```typescript
import { describe, it, expect } from "@effect/vitest"
import { Effect } from "effect"

describe("MyService", () => {
  // Use it.effect for Effect-returning tests
  it.effect("performs operation successfully", () =>
    Effect.gen(function* () {
      const result = yield* myOperation()
      expect(result).toBe("expected")
    })
  )

  // Use it.scoped for tests with scoped resources
  it.scoped("acquires and releases resource", () =>
    Effect.gen(function* () {
      const resource = yield* acquireResource()
      expect(resource.isAcquired).toBe(true)
      // resource automatically released after test
    })
  )
})
```

### Providing Test Layers

```typescript
import { describe, it, expect } from "@effect/vitest"
import { Effect, Layer } from "effect"

describe("UserService", () => {
  const testLayer = Layer.merge(
    Database.testLayer,
    Cache.testLayer
  )

  it.effect("finds user by id", () =>
    Effect.gen(function* () {
      const users = yield* UserService
      const user = yield* users.findById(UserId.make("user-1"))
      expect(user.name).toBe("Alice")
    }).pipe(Effect.provide(testLayer))
  )
})
```

### Testing Time-Dependent Code

Use `TestClock` for deterministic time tests:

```typescript
import { describe, it, expect } from "@effect/vitest"
import { Effect, TestClock } from "effect"

describe("Scheduler", () => {
  it.effect("executes after delay", () =>
    Effect.gen(function* () {
      let executed = false

      // Start delayed effect in background
      yield* Effect.fork(
        Effect.delay(Effect.sync(() => { executed = true }), "1 hour")
      )

      // Advance time
      yield* TestClock.adjust("1 hour")

      expect(executed).toBe(true)
    })
  )
})
```

### Testing Error Cases

```typescript
import { describe, it, expect } from "@effect/vitest"
import { Effect } from "effect"

describe("Validation", () => {
  it.effect("fails with ValidationError for invalid input", () =>
    Effect.gen(function* () {
      const result = yield* validateEmail("invalid").pipe(Effect.flip)
      expect(result._tag).toBe("ValidationError")
      expect(result.field).toBe("email")
    })
  )

  it.effect("succeeds with valid input", () =>
    Effect.gen(function* () {
      const result = yield* validateEmail("valid@example.com")
      expect(result).toBe("valid@example.com")
    })
  )
})
```

### Live Tests

For tests that need real time or resources:

```typescript
import { describe, it } from "@effect/vitest"
import { Effect } from "effect"

describe("Integration", () => {
  it.live("makes real HTTP call", () =>
    Effect.gen(function* () {
      const response = yield* httpClient.get("https://api.example.com/health")
      expect(response.status).toBe(200)
    })
  )
})
```

### Testing Services with Mocks

```typescript
import { describe, it, expect } from "@effect/vitest"
import { Effect, Layer } from "effect"

describe("Events", () => {
  // Create test layers that record calls
  const mockEmails = Layer.sync(Emails, () => {
    const sent: Array<{ to: string; subject: string }> = []

    return Emails.of({
      send: (to, subject, body) =>
        Effect.sync(() => { sent.push({ to, subject }) })
    })
  })

  it.effect("sends confirmation email on registration", () =>
    Effect.gen(function* () {
      const events = yield* Events
      yield* events.register(eventId, userId)

      // Verify email was sent
      // (access mock state through your test setup)
    }).pipe(Effect.provide(mockEmails))
  )
})
```

### Best Practices

- **Use `it.effect`** for all Effect-returning tests
- **Use `it.scoped`** when tests acquire resources
- **Use `it.live`** only when you need real time/resources
- **Create test layers** as static properties on service classes
- **Test error cases** with `Effect.flip` to access the error channel
- **Use TestClock** for time-dependent logic
- **Keep tests focused** - one behavior per test
