## Iteration Patterns

Functional iteration patterns that produce cleaner, more declarative code. These rules apply to all TypeScript code, not just Effect-specific code.

### Never Use .forEach()

**Rule:** Never use `.forEach()`. Use `for...of` for side effects, or `.map()/.filter()/.reduce()` for transformations.

**Why:**
- `for...of` supports `break`, `continue`, `return`, and `await`
- `.forEach()` cannot be broken out of
- `.forEach()` with async callbacks doesn't await properly
- `for...of` is more readable for imperative code

```typescript
// Bad: forEach for side effects
items.forEach((item) => {
  console.log(item.name)
})

// Good: for...of for side effects
for (const item of items) {
  console.log(item.name)
}

// Bad: forEach with early return attempt (doesn't work!)
items.forEach((item) => {
  if (item.found) return  // Only returns from callback, not outer function
  process(item)
})

// Good: for...of with break
for (const item of items) {
  if (item.found) break
  process(item)
}

// Bad: forEach with async (doesn't await properly)
items.forEach(async (item) => {
  await processAsync(item)  // Fire-and-forget, no sequential execution
})

// Good: for...of with async
for (const item of items) {
  await processAsync(item)  // Properly sequential
}
```

### Build Objects Declaratively with Object.fromEntries

**Rule:** Never create an empty object and populate it with a loop. Use `Object.fromEntries()` with `.map()` and `.filter()`.

**Why:**
- Declarative over imperative
- Single expression, no mutation
- Type inference works better
- Easier to reason about

```typescript
// Bad: Empty object + forEach mutation
const defaults: ShortcutConfig = {}
;(Object.keys(SHORTCUT_PATTERNS) as ShortcutKey[]).forEach((key) => {
  const match = models.find((m) => SHORTCUT_PATTERNS[key].test(m.id))
  if (match) defaults[key] = match.id
})
return defaults

// Good: Object.fromEntries with map + filter
const defaults = Object.fromEntries(
  (Object.keys(SHORTCUT_PATTERNS) as ShortcutKey[])
    .map((key) => {
      const match = models.find((m) => SHORTCUT_PATTERNS[key].test(m.id))
      return match ? [key, match.id] as const : null
    })
    .filter((entry): entry is [ShortcutKey, string] => entry !== null)
) as ShortcutConfig
```

### Never Conditionally Add Keys to Objects

**Rule:** Never build objects by conditionally adding keys one-by-one. Collect all values first, then filter.

**Why:**
- Scattered conditionals are hard to follow
- Easy to miss a case or introduce bugs
- Not composable or testable

```typescript
// Bad: Conditional key addition
const result: ShortcutConfig = {}
if (g !== undefined) result.g = g
if (c !== undefined) result.c = c
if (i !== undefined) result.i = i
if (o !== undefined) result.o = o

// Good: Collect all, filter undefined
const choices = { g, c, i, o }
const result = Object.fromEntries(
  Object.entries(choices).filter(([_, v]) => v !== undefined)
) as ShortcutConfig

// Better: Single pipeline from source data
const keys = ["g", "c", "i", "o"] as const
const result = Object.fromEntries(
  (await Promise.all(keys.map(async (key) => [key, await choose(key)] as const)))
    .filter(([_, v]) => v !== undefined)
) as ShortcutConfig
```

### Prefer Pipelines Over Intermediate Variables

**Rule:** Chain transformations in a single pipeline rather than creating intermediate mutable state.

```typescript
// Bad: Intermediate variables with mutation
const items = getItems()
const filtered = []
for (const item of items) {
  if (item.active) filtered.push(item)
}
const sorted = filtered.sort((a, b) => a.name.localeCompare(b.name))
const names = []
for (const item of sorted) {
  names.push(item.name)
}

// Good: Single pipeline
const names = getItems()
  .filter((item) => item.active)
  .sort((a, b) => a.name.localeCompare(b.name))
  .map((item) => item.name)
```

### Use for...of When You Need Side Effects

When you genuinely need side effects (logging, I/O, mutation of external state), use `for...of`:

```typescript
// Correct: for...of for side effects
for (const user of users) {
  await sendEmail(user.email)
  console.log(`Sent email to ${user.name}`)
}

// Correct: for...of when you need break/continue
for (const item of items) {
  if (item.skip) continue
  if (item.done) break
  await process(item)
}
```

### Effect-Specific: Use Effect.forEach for Effectful Iteration

When iterating with Effects, use `Effect.forEach`:

```typescript
import { Effect } from "effect"

// Good: Effect.forEach for effectful iteration
const results = yield* Effect.forEach(users, (user) =>
  Effect.gen(function* () {
    yield* sendEmail(user.email)
    yield* Effect.logInfo(`Sent email to ${user.name}`)
    return user.id
  })
)

// With concurrency control
const results = yield* Effect.forEach(
  users,
  (user) => processUser(user),
  { concurrency: 5 }
)
```

### Summary

| Pattern | Use Instead |
|---------|-------------|
| `.forEach()` for side effects | `for...of` |
| `.forEach()` for transformation | `.map()` / `.filter()` / `.reduce()` |
| Empty object + loop mutation | `Object.fromEntries()` + `.map()` + `.filter()` |
| Conditional key additions | Collect all values, then filter |
| Multiple intermediate variables | Single transformation pipeline |
| Async `.forEach()` | `for...of` with `await` or `Promise.all()` with `.map()` |
