## Data Modeling with Schema

Effect's `Schema` library provides runtime validation, serialization, and type safety from a single source of truth.

### Why Schema?

- **Single source of truth**: TypeScript types + runtime validation + JSON serialization
- **Parse safely**: validate HTTP/CLI/config data with detailed errors
- **Rich domain types**: branded primitives prevent mixing similar types
- **Ecosystem integration**: same schema works everywhere (RPC, HttpApi, CLI)

### Records (AND Types)

Use `Schema.Class` for composite data models:

```typescript
import { Schema } from "effect"

const UserId = Schema.String.pipe(Schema.brand("UserId"))
type UserId = typeof UserId.Type

export class User extends Schema.Class<User>("User")({
  id: UserId,
  name: Schema.String,
  email: Schema.String,
  createdAt: Schema.Date,
}) {
  get displayName() {
    return `${this.name} (${this.email})`
  }
}

const user = User.make({
  id: UserId.make("user-123"),
  name: "Alice",
  email: "alice@example.com",
  createdAt: new Date(),
})
```

### Variants (OR Types)

Simple alternatives with `Schema.Literal`:

```typescript
const Status = Schema.Literal("pending", "active", "completed")
type Status = typeof Status.Type // "pending" | "active" | "completed"
```

Structured variants with `Schema.TaggedClass` and `Schema.Union`:

```typescript
import { Match, Schema } from "effect"

export class Success extends Schema.TaggedClass<Success>()("Success", {
  value: Schema.Number,
}) {}

export class Failure extends Schema.TaggedClass<Failure>()("Failure", {
  error: Schema.String,
}) {}

export const Result = Schema.Union(Success, Failure)
export type Result = typeof Result.Type

// Pattern match with Match.valueTags
Match.valueTags(result, {
  Success: ({ value }) => `Got: ${value}`,
  Failure: ({ error }) => `Error: ${error}`
})
```

### Branded Types

**In a well-designed domain model, nearly all primitives should be branded.** Not just IDs, but emails, URLs, timestamps, counts, percentages.

```typescript
import { Schema } from "effect"

// IDs - prevent mixing different entity IDs
export const UserId = Schema.String.pipe(Schema.brand("UserId"))
export type UserId = typeof UserId.Type

export const PostId = Schema.String.pipe(Schema.brand("PostId"))
export type PostId = typeof PostId.Type

// Domain primitives
export const Email = Schema.String.pipe(Schema.brand("Email"))
export type Email = typeof Email.Type

export const Port = Schema.Int.pipe(Schema.between(1, 65535), Schema.brand("Port"))
export type Port = typeof Port.Type

// Usage - impossible to mix types
function getUser(id: UserId) { /* ... */ }
function sendEmail(to: Email) { /* ... */ }

getUser(userId)    // works
// getUser(postId) // type error: Can't pass PostId where UserId expected
// getUser("raw")  // type error: Can't assign raw string to branded type
```

### JSON Encoding & Decoding

Use `Schema.parseJson` to parse JSON strings and validate with your schema:

```typescript
import { Effect, Schema } from "effect"

class Move extends Schema.Class<Move>("Move")({
  from: Position,
  to: Position,
}) {}

// parseJson combines JSON.parse + schema decoding
const MoveFromJson = Schema.parseJson(Move)

const program = Effect.gen(function* () {
  // Parse and validate JSON string
  const jsonString = '{"from":{"row":"A","column":"1"},"to":{"row":"B","column":"2"}}'
  const move = yield* Schema.decodeUnknown(MoveFromJson)(jsonString)

  // Encode to JSON string
  const json = yield* Schema.encode(MoveFromJson)(move)
  return json
})
```

### Validation at Boundaries

Validate external data immediately upon entry:

```typescript
import { Effect, Schema } from "effect"

const ConfigSchema = Schema.Struct({
  port: Schema.Int.pipe(Schema.between(1, 65535)),
  host: Schema.String,
  apiKey: Schema.String.pipe(Schema.nonEmptyString()),
})

const loadConfig = Effect.gen(function* () {
  const text = yield* Effect.tryPromise(() =>
    fs.readFile("config.json", "utf8")
  )
  const raw = JSON.parse(text)
  return yield* Schema.decodeUnknown(ConfigSchema)(raw)
})
```

### Optional Fields

Use `Schema.optionalWith` for optional fields with defaults:

```typescript
class Config extends Schema.Class<Config>("Config")({
  port: Schema.optionalWith(Schema.Int, { default: () => 3000 }),
  host: Schema.optionalWith(Schema.String, { default: () => "localhost" }),
  debug: Schema.optionalWith(Schema.Boolean, { default: () => false }),
}) {}
```
