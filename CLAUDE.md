# Repository Guidelines

## Project Structure & Module Organization

Source lives in `src/`, with domain modules split across `api` (Copilot models), `auth` (token caching and OAuth helpers), `core` (chat/model orchestration), `services` (Effect-based adapters such as `FileSystemService`), `utils`, and runtime wiring. CLI entry points reside in `src/tools` and are exported through the `bin` map (`chatsh`, `holefill`, `refactor`). Standards and playbooks live under `agent-os/standards/**`; skim them before touching a new area.

## Build, Test, and Development Commands

- `bun install` — install dependencies defined in `bun.lock`.
- `bun run typecheck` — run `tsc --noEmit` for a full project type pass; keep it clean before requesting review.
- `bun run src/tools/chatsh.ts -- --help` (swap in `holefill.ts` or `refactor.ts`) — executes whichever CLI you are modifying so you can test interactive flows locally.

## Coding Style & Naming Conventions

Follow the Effect-first TypeScript guidelines in `agent-os/standards/global`. Prefer single-word `const` names, avoid `let`, `any`, `else`, and `try/catch` unless absolutely required, and build async flows with `Effect.gen`. Keep functions narrow but cohesive, delete dead code, and lean on descriptive identifiers instead of comments. When validation or error messaging is needed, use typed error channels from Effect rather than throwing.

## Testing Guidelines

This repo currently relies on targeted, high-value tests (see `agent-os/standards/testing/test-writing.md`). Add tests only for critical chat/refactor workflows, name them after the behavior being verified (e.g., `chat-instance.behavior.test.ts`), and place them adjacent to the module they cover. Use Bun's built-in runner (`bun test src/core/chat-instance.behavior.test.ts`) when you do add coverage, and keep runs fast so they fit into the regular inner loop.

## Commit & Pull Request Guidelines

Commits follow a Conventional style with scopes (`feat(effect): ...`). Keep each commit focused, include any relevant scope, and write imperative summaries. Pull requests should explain the user impact, link tracking issues, and include CLI output or screenshots when UX changes. Always note whether `bun run typecheck` passed and describe any testing performed so reviewers can reproduce it quickly.

## Security & Configuration Tips

Never commit secrets—tokens are persisted locally via `src/auth/token-store.ts` to `~/.config/copilot-scripts/tokens.json`. If you need new configuration, surface it via environment variables and document how to set them in the PR body rather than hard-coding defaults. Validate and sanitize all external inputs at module boundaries so downstream services only receive well-typed data.

<!-- effect-solutions:start -->
## Effect Solutions Usage

The Effect Solutions CLI provides curated best practices and patterns for Effect TypeScript. Before working on Effect code, check if there's a relevant topic that covers your use case.

- `effect-solutions list` - List all available topics
- `effect-solutions show <slug...>` - Read one or more topics
- `effect-solutions search <term>` - Search topics by keyword

**Local Effect Source:** The Effect repository is cloned to `~/.local/share/effect-solutions/effect` for reference. Use this to explore APIs, find usage examples, and understand implementation details when the documentation isn't enough.
<!-- effect-solutions:end -->
