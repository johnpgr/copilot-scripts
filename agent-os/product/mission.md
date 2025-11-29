# Product Mission

## Vision

Enable CLI-native developers to access AI coding assistance without leaving terminal. Preserve flow state and command-line composability.

## Pitch

copilot-scripts is a suite of CLI tools that helps developers interact with AI code completion and modification by providing purpose-built command-line utilities for chat, code completion, and refactoring workflows powered by GitHub Copilot API.

## Users

### Primary Customers

- **CLI-Native Developers**: Engineers who prefer terminal-based workflows over GUI editors
- **Power Users**: Developers who want programmatic AI assistance integrated into their shell scripts and automation
- **Minimalist Engineers**: Practitioners who want focused, single-purpose tools without IDE overhead

### User Personas

**Terminal-First Engineer** (25-45)

- **Role:** Software engineer, DevOps engineer, or systems programmer
- **Context:** Works primarily in terminal environments, tmux/screen sessions, or remote SSH connections
- **Pain Points:** AI coding assistants are locked inside heavy IDEs; need quick AI help without context switching
- **Goals:** Get AI assistance for code without leaving terminal; automate repetitive coding tasks

**Automation Engineer** (28-50)

- **Role:** Build engineer, DevOps specialist, or script maintainer
- **Context:** Maintains codebases with shell scripts, build automation, and deployment pipelines
- **Pain Points:** Difficult to integrate AI coding help into existing automation workflows
- **Goals:** Pipe code through AI for transformation; script bulk refactoring operations

## The Problem

### Context Switching Kills Flow

Developers working in terminal environments must switch to heavy IDE windows to access AI coding assistants, breaking flow state and reducing productivity. Existing AI tools assume GUI-based workflows.

**Our Solution:** Lightweight CLI tools that integrate directly into terminal workflows, enabling AI assistance without context switching.

### Limited Programmability of AI Assistants

Most AI coding tools are designed for interactive GUI use, making it difficult to script, automate, or compose AI operations with shell utilities and existing toolchains.

**Our Solution:** Unix-philosophy tools that accept input via arguments/stdin and produce output to stdout, composable with pipes and shell scripts.

### One-Size-Fits-All Complexity

Modern IDEs bundle AI assistance with extensive features most users don't need, requiring installation of large applications even for simple AI queries.

**Our Solution:** Separate, focused utilities (chatsh, holefill, refactor) that each solve one problem well, installable and usable independently.

## Differentiators

### Terminal-Native Design

Unlike VSCode Copilot or Cursor, copilot-scripts runs entirely in the terminal with no GUI dependency. This enables usage in SSH sessions, tmux workflows, and headless environments where GUI tools fail.

### Composable Architecture

Unlike monolithic AI assistants, each tool follows Unix philosophy: do one thing well, accept standard input, produce standard output. This enables scripting, automation, and integration with existing developer toolchains.

### Effect-Based Reliability

Unlike traditional Node.js tools, copilot-scripts uses Effect TS for typed error handling and resource management. This results in predictable failures, proper cleanup, and composable async operations without callback hell or unhandled rejections.

### Open Source Strategy

copilot-scripts focuses on individual developers through community-driven development. The Effect-based architecture makes the codebase contribution-friendly with clear module boundaries, typed errors, and testable services. Development happens transparently with an open roadmap and decision-making process.

## Key Features

### Core Features

- **ChatSH**: Interactive terminal chat with AI that can execute shell commands, maintaining conversation context across multiple exchanges
- **HoleFill**: Precise code completion at designated placeholder markers, preserving exact indentation and code style
- **Refactor**: Block-based code transformation using structured patch commands, enabling bulk modifications across multiple code blocks

### Developer Experience Features

- **Token Caching**: Automatic OAuth token management with local persistence, eliminating repeated authentication
- **Model Selection**: Flexible model resolver supporting aliases (g/c/o) and specific model IDs for different use cases
- **Streaming Output**: Real-time response streaming with visual progress indicators for immediate feedback

### Integration Features

- **Context Import**: Inline file imports in code holes using comment-based syntax for multi-file awareness
- **Log Persistence**: Automatic session logging to timestamped files for conversation history and debugging
- **Bun Runtime**: Fast startup and execution leveraging Bun's native TypeScript support

## Success Metrics

- **Adoption**: 1,000+ GitHub stars within 6 months
- **Active Usage**: 100+ daily active users
- **Community**: 10+ external contributors
- **Performance**: <100ms startup time maintained
- **Quality**: 90%+ test coverage on core services

## Anti-Goals

What we explicitly won't pursue:

- **No Team Features**: No Slack bots, shared configs, or multi-user collaboration
- **No GUI**: Terminal-only, no desktop or web interfaces
- **No Proprietary APIs**: GitHub Copilot only, no vendor lock-in beyond that
- **No Breaking Unix Philosophy**: Every tool must remain composable with pipes and scripts
