## Coding style best practices

- **Consistent Naming Conventions**: Establish and follow naming conventions for variables, functions, classes, and files across the codebase
- **Automated Formatting**: Maintain consistent code style (indenting, line breaks, etc.)
- **Meaningful Names**: Choose descriptive names that reveal intent; avoid abbreviations and single-letter variables except in narrow contexts
- **Small, Focused Functions**: Keep functions small and focused on a single task for better readability and testability **However** Try to keep things in one function unless composable or reusable
- **Consistent Indentation**: Use consistent indentation (spaces or tabs) and configure your editor/linter to enforce it
- **Remove Dead Code**: Delete unused code, commented-out blocks, and imports rather than leaving them as clutter
- **Backward compatibility only when required:** Unless specifically instructed otherwise, assume you do not need to write additional code logic to handle backward compatibility.
- **DRY Principle**: Avoid duplication by extracting common logic into reusable functions or modules

## Typescript/Javascript specifics

- DO NOT do unnecessary destructuring of variables
- DO NOT use `else` statements unless necessary
- DO NOT use `try`/`catch` if it can be avoided
- AVOID `try`/`catch` where possible
- AVOID `else` statements
- AVOID using `any` type
- AVOID `let` statements
- PREFER single word variable names where possible

### Effect TS & Functional Programming

- **Typed Error Channels**: Always use the error channel of `Effect<Success, Error>` to model expected failures. Avoid throwing exceptions in domain logic.
- **Generator Syntax**: Prefer `Effect.gen(function* (_) { ... })` for readable, sequential effect composition over deeply nested `flatMap` chains.
- **Explicit Resource Management**: Use `Effect.acquireRelease` or `Effect.scope` to ensure resources (files, connections) are properly acquired and released, even in the presence of failures.
- **Edge-of-World Execution**: Only run Effects (via `Effect.runPromise`, `Effect.runSync`) at the entry point of the application (CLI handlers, API route handlers). Keep the core application logic pure and composed of Effects.
- **Dependency Injection**: Use arguments or `Effect.Context` to inject dependencies (like `FileSystem`, `CopilotService`) rather than hardcoding global instances. This improves testability and modularity.
- **Fail Fast & Precisely**: Use specific, semantic error types (e.g., `FsError`, `ApiError`) to allow granular error handling upstream. Avoid generic `Error` types where possible.
- **Option over Null**: Use `Option<T>` for values that might be missing. Avoid `null` and `undefined` in domain logic to prevent null pointer exceptions.
- **Validation at Boundaries**: Validate external data (files, API responses) immediately upon entry, converting validation failures into typed Errors.
- **No Implicit Side Effects**: All side effects (I/O, random number generation, date access) must be wrapped in `Effect` to maintain purity and control.
- **Safe Interop**: When calling non-Effect async code, always use `Effect.tryPromise` and strictly type the error that can be returned.
