## Services & Layers

Effect's service pattern provides deterministic dependency injection. Define services as `Context.Tag` classes and compose them into Layers for type-safe, testable, modular code.

### Defining Services

A service is defined using `Context.Tag` as a class:

```typescript
import { Context, Effect } from "effect"

class Database extends Context.Tag("@app/Database")<
  Database,
  {
    readonly query: (sql: string) => Effect.Effect<unknown[]>
    readonly execute: (sql: string) => Effect.Effect<void>
  }
>() {}

class Logger extends Context.Tag("@app/Logger")<
  Logger,
  {
    readonly log: (message: string) => Effect.Effect<void>
  }
>() {}
```

**Rules:**
- Tag identifiers must be unique - use `@path/to/ServiceName` prefix
- Service methods should have no dependencies (`R = never`) - dependencies via Layer composition
- Use readonly properties - services should not expose mutable state

### Creating Layers

A Layer is an implementation of a service:

```typescript
import { Context, Effect, Layer } from "effect"

class Users extends Context.Tag("@app/Users")<
  Users,
  {
    readonly findById: (id: string) => Effect.Effect<User>
  }
>() {
  static readonly layer = Layer.effect(
    Users,
    Effect.gen(function* () {
      // 1. yield* dependencies
      const http = yield* HttpClient.HttpClient
      const analytics = yield* Analytics

      // 2. define methods with Effect.fn for tracing
      const findById = Effect.fn("Users.findById")(function* (id: string) {
        yield* analytics.track("user.find", { id })
        const response = yield* http.get(`/users/${id}`)
        return yield* HttpClientResponse.schemaBodyJson(User)(response)
      })

      // 3. return the service
      return Users.of({ findById })
    })
  )
}
```

**Layer naming:** camelCase with `Layer` suffix: `layer`, `testLayer`, `postgresLayer`

### Service-Driven Development

Start by sketching leaf service tags without implementations. Write real TypeScript that type-checks even though services aren't runnable:

```typescript
// Leaf services: contracts only
class Users extends Context.Tag("@app/Users")<
  Users,
  { readonly findById: (id: UserId) => Effect.Effect<User> }
>() {}

class Emails extends Context.Tag("@app/Emails")<
  Emails,
  { readonly send: (to: string, subject: string, body: string) => Effect.Effect<void> }
>() {}

// Higher-level orchestration - type-checks immediately
class Events extends Context.Tag("@app/Events")<Events, {...}>() {
  static readonly layer = Layer.effect(
    Events,
    Effect.gen(function* () {
      const users = yield* Users
      const emails = yield* Emails
      // ... orchestration logic
    })
  )
}
```

### Test Layers

Create lightweight test implementations:

```typescript
class Database extends Context.Tag("@app/Database")<...>() {
  static readonly testLayer = Layer.sync(Database, () => {
    let records: Record<string, unknown> = { "user-1": { id: "user-1", name: "Alice" } }

    const query = (sql: string) => Effect.succeed(Object.values(records))
    const execute = (sql: string) => Console.log(`Test execute: ${sql}`)

    return Database.of({ query, execute })
  })
}
```

### Providing Layers

Use `Effect.provide` once at the top of your application:

```typescript
// Compose all layers
const appLayer = userServiceLayer.pipe(
  Layer.provideMerge(databaseLayer),
  Layer.provideMerge(loggerLayer),
  Layer.provideMerge(configLayer)
)

// Provide once at entry point
const main = program.pipe(Effect.provide(appLayer))
Effect.runPromise(main)
```

**Why provide once at the top?**
- Clear dependency graph in one place
- Easier testing: swap `appLayer` for `testLayer`
- No hidden dependencies
- Simpler refactoring

### Layer Memoization

Effect memoizes layers by reference identity. Store parameterized layers in constants:

```typescript
// Bad: two connection pools
const bad = Layer.merge(
  UserRepo.layer.pipe(Layer.provide(Postgres.layer({ url: "...", poolSize: 10 }))),
  OrderRepo.layer.pipe(Layer.provide(Postgres.layer({ url: "...", poolSize: 10 })))
)

// Good: single shared pool
const postgresLayer = Postgres.layer({ url: "...", poolSize: 10 })
const good = Layer.merge(
  UserRepo.layer.pipe(Layer.provide(postgresLayer)),
  OrderRepo.layer.pipe(Layer.provide(postgresLayer))
)
```
