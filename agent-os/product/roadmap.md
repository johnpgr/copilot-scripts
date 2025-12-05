# Product Roadmap

## Current Status (v0.1.0 - Active Development)

### Completed

- ✅ **ChatSH**: Interactive terminal chat with command execution via `<RUN>` tags
- ✅ **HoleFill**: Code completion at placeholder markers with indentation preservation
- ✅ **Refactor**: Block-based code transformation with structured patches
- ✅ **Effect Migration**: Services layer with typed error handling (AuthError, ApiError, FsError, ParseError)
- ✅ **OAuth Token Caching**: Device flow authentication with local persistence
- ✅ **Streaming Responses**: SSE parsing with real-time progress indicators
- ✅ **Model Selection**: Aliases (g/c/i/o) and specific model ID support

### In Progress

- 🚧 Documentation and usage examples
- 🚧 Error handling refinement and user-friendly messages
- 🚧 Test coverage expansion

## Phase 1: Stability & Polish (v0.2.0 - 2-3 months)

**Goal:** Production-ready tools with comprehensive testing and documentation

### Core Stability

- Comprehensive test coverage (90%+ on services layer)
- CI/CD pipeline with automated releases
- Error messages user-tested and refined
- Performance benchmarks established and monitored

### Developer Experience

- npm/bun global installation support
- Comprehensive README with examples for each tool
- Troubleshooting guide for common issues
- Contribution guidelines and architecture docs
- Video demos showing real-world usage

### Feature Completions

- **HoleFill**: Multi-hole support in single file
- **Refactor**: Multi-file transformation support
- **ChatSH**: Conversation export and replay functionality
- **Config Files**: User configuration at `~/.copilot-scripts/config.json`
- **All Tools**: Consistent error handling and logging patterns

## Phase 2: Enhancement & Integration (v0.3.0 - 4-6 months)

**Goal:** Rich customization and workflow integration

### Custom Prompts

- User-defined system prompts per tool
- Prompt templates library for common tasks
- Context injection patterns (import project context)
- Prompt versioning and sharing

### Shell Integration

- Shell script examples library
- Git hooks integration patterns
- Editor integration documentation (vim, emacs, neovim)
- CI pipeline integration examples

### Advanced Features

- Conversation search and analysis
- Token usage tracking and optimization
- Multi-model comparison mode
- Batch processing support

## Phase 3: Advanced Features (v0.4.0 - 7-12 months)

**Goal:** Ecosystem maturity and advanced workflows

### Community Resources

- Shared prompt library repository
- Example use cases and patterns repository
- Community showcase of integrations
- Monthly feature demos and feedback sessions

### Performance & Analytics

- Performance profiling tools
- Usage analytics (local, privacy-preserving)
- Optimization recommendations
- Startup time micro-optimizations

### Tool Integrations

- Common CLI tool integrations (jq, sed, awk)
- Framework-specific helpers (for React, Node, etc.)
- Language-specific context providers
- Build tool integrations (make, cargo, npm scripts)

## Beyond v1.0 - Future Considerations

Items requiring further validation before commitment:

- Project-level context management and indexing
- AI-assisted refactoring workflows with multi-step planning
- Code review automation and diff analysis
- Alternative AI provider support (Ollama for local models) - not current focus
- Collaborative sessions with shared context (async, not real-time)

## Release Cadence

- **v0.x releases**: Every 4-6 weeks with incremental features and fixes
- **Beta period**: 3-6 months gathering user feedback and stability improvements
- **v1.0**: When stability metrics met, docs complete, and API stabilized
- **Post-v1.0**: Semantic versioning with breaking changes only on major versions

## Versioning Philosophy

- Maintain backward compatibility within major versions
- Clear migration guides for breaking changes
- Deprecation warnings at least one minor version before removal
- API surface intentionally kept minimal for stability
