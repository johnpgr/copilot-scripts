# Technical Stack

## Philosophy

copilot-scripts uses Effect-first functional programming to ensure reliability, composability, and maintainability in CLI environments. Every architectural choice prioritizes fast startup, predictable errors, and Unix composability.

## Core Stack

### Runtime & Language

**Bun 1.x**
- Native TypeScript execution without transpilation
- <50ms startup time critical for CLI responsiveness
- Built-in test runner eliminates dev dependencies
- Alternative considered: Node.js - rejected due to 200-400ms startup overhead

**TypeScript 5.9+**
- Strict mode enabled throughout codebase
- No `any` types except at FFI boundaries
- Functional style preferred over imperative
- Type inference reduces boilerplate

### Effect Ecosystem

The Effect-TS library forms the architectural foundation. Unlike traditional Promise-based code, Effect provides typed error channels, resource cleanup guarantees, and composable async operations.

**effect (3.19.8+)**
- Core Effect type for all async operations
- Generator-based composition eliminates callback hell
- Typed error channels ensure exhaustive error handling
- Resource management via acquireRelease patterns

**@effect/platform & @effect/platform-node**
- FileSystem abstractions with proper error types
- Command execution with typed failures
- Path manipulation utilities
- Platform-specific implementations for Node/Bun

**@effect/schema (0.75.5+)**
- Runtime type validation at system boundaries
- API response validation prevents ParseErrors
- Configuration file decoding with typed errors
- Automatic serialization/deserialization

### Dependencies

**gpt-tokenizer (2.9.0)**
- Token counting for context window management
- Critical for staying within API limits (4K-128K tokens)
- Fast pure computation, no async overhead

Total direct dependencies: 5 (effect, @effect/platform, @effect/platform-node, @effect/schema, gpt-tokenizer)

### Development Tools

- **TypeScript Compiler**: Type checking only via `tsc --noEmit`
- **Bun Test Runner**: Integrated, zero-config testing
- **No Bundler**: Direct execution via Bun runtime
- **No Build Step**: TS files executed natively

## Architectural Patterns

### Effect-First Design

All I/O operations wrapped in Effect types. Services return Effect values, never throw exceptions. Errors propagate through typed channels, making failure modes explicit in function signatures.

### Typed Error Channels

Four error types model all failure modes:
- **AuthError**: OAuth device flow failures, token expiration
- **ApiError**: GitHub Copilot API communication issues
- **FsError**: File system operations (read, write, permissions)
- **ParseError**: JSON parsing failures, schema validation errors

Errors handled explicitly using Effect.catchTag for type-safe recovery.

### Service Layer Pattern

Architecture organized in layers:
```
Tools (CLI entry points: chatsh, holefill, refactor)
  ↓
Core (Orchestration: CopilotChatInstance, ModelResolver)
  ↓
Services (Effect-wrapped: Auth, Copilot, FileSystem, Log)
  ↓
API/Utils (Pure logic: streaming, tokenizer)
```

Each layer depends only on layers below. No circular dependencies.

### Dependency Injection

Services passed explicitly as function arguments. No global state, no singletons. Runtime creates service graph at startup via RuntimeServices.create().

Benefits:
- Testability: mock services in tests
- Clarity: dependencies visible in signatures
- Flexibility: swap implementations easily

## API Integration

### GitHub Copilot API

**Authentication**: OAuth 2.0 device flow
- User visits GitHub URL, enters code
- Token cached at `~/.config/copilot-scripts/tokens.json`
- Automatic token refresh on expiration
- Bearer token passed in Authorization header

**Endpoints**:
- `/chat/completions`: Streaming chat responses (SSE)
- `/models`: Available model list

**Headers**:
- Editor-Version: Identifies runtime (`Bun/1.x.x`)
- Editor-Plugin-Version: Tool version (`copilot-scripts/0.1.0`)
- Copilot-Integration-Id: Integration type (`vscode-chat`)

### Streaming Protocol

Server-Sent Events (SSE) parsed incrementally:
- Effect Stream provides backpressure control
- Real-time chunk processing for responsive UX
- Graceful handling of stream interruption
- Memory-efficient for long responses

## File Structure

```
src/
  api/          # GitHub Copilot API clients
  auth/         # OAuth device flow, token persistence
  core/         # Chat instance orchestration, model resolver
  errors/       # Typed error class definitions
  schemas/      # Effect Schema validators (tokens, API responses)
  services/     # Effect service implementations
    AuthService.ts        # OAuth and token management
    CopilotService.ts     # API request/stream wrappers
    FileSystemService.ts  # File I/O with FsError
    LogService.ts         # Session logging
  tools/        # CLI entry points (chatsh, holefill, refactor)
  utils/        # Pure utilities (streaming parser, tokenizer, logger)
  index.ts      # Public API exports
  runtime.ts    # Service dependency wiring
```

Services created in runtime.ts, passed down through application layers. Tools import services from runtime, execute Effect programs.

## Testing Strategy

- **Unit Tests**: Services in isolation with mocked dependencies
- **Integration Tests**: Full tool workflows end-to-end
- **Test Runner**: `bun test` with native TypeScript support
- **Test Location**: Co-located with implementation (`*.test.ts`)
- **Coverage Goal**: 90%+ on services layer where business logic lives

Effect's testability advantages:
- Services easily mocked via interface
- Errors testable via Effect.runPromiseExit
- Deterministic async via Effect.gen

## Performance Targets

- **Startup Time**: <100ms from shell invocation to first prompt
- **Token Caching**: Zero authentication overhead after initial flow
- **Streaming Latency**: <200ms to first chunk from API
- **Memory Footprint**: <50MB during active streaming

Optimizations:
- Bun's native TS execution eliminates transpilation overhead
- Lazy service initialization where possible
- Minimal dependency tree reduces module resolution time
- Direct file execution, no bundling step

## Security Considerations

### Token Storage

- **Location**: `~/.config/copilot-scripts/tokens.json`
- **Permissions**: 0600 (user read/write only)
- **Contents**: OAuth access token, refresh token, expiry
- **Handling**: Never logged, never transmitted except to GitHub API

### Input Validation

- All external inputs validated at boundaries
- Effect Schema runtime type checking
- No shell injection in command execution
- API responses validated against schemas

### Dependencies

- Minimal dependency tree (5 direct deps)
- Regular security audits via `bun audit`
- No native addons (pure TypeScript/JavaScript)
- Effect ecosystem actively maintained

## Deployment & Distribution

### Installation Methods

**Global Install**:
```bash
bun install -g copilot-scripts
```

**From Source**:
```bash
git clone <repo>
bun install
bun link
```

**Binary Executables** (Future):
- `chatsh`, `holefill`, `refactor` in PATH
- Single-file binaries via `bun build --compile`

### Platform Support

- **Primary**: Linux, macOS
- **Secondary**: Windows via WSL (recommended)
- **Architecture**: x64, arm64 (Bun supported platforms)

## Alternative Technologies Considered

### Why Not Node.js?

- Slower startup: 200-400ms vs <50ms with Bun
- Requires transpilation step for TypeScript
- Less integrated tooling (separate test runner, etc.)
- More complex dependency management

### Why Not Deno?

- Smaller ecosystem for Effect libraries
- Permission model adds friction for CLI tools
- Bun has better npm compatibility
- Performance benefits minimal for this use case

### Why Not Go/Rust?

- TypeScript enables Effect ecosystem access
- Faster iteration for CLI tools and experimentation
- Better JSON/API integration (native async/await)
- Effect patterns unavailable in Go/Rust

### Why Effect Instead of Plain Promises?

- **Typed Errors**: Eliminates unhandled rejections, forces error handling
- **Resource Cleanup**: Guarantees via acquireRelease, no leaks
- **Composability**: Generator syntax cleaner than Promise.then chains
- **Testability**: Dependency injection natural, mocking straightforward
- **Debugging**: Better stack traces, error context preservation

## Future Technical Considerations

Items under evaluation, not committed:

- **Local Models**: Ollama/llama.cpp integration for offline usage
- **Binary Compilation**: Single-file executables for easier distribution
- **WebSocket Support**: Alternative to SSE for bidirectional streaming
- **Plugin Architecture**: Dynamic module loading for extensibility

These require architectural changes and will be evaluated based on user demand and technical feasibility.
