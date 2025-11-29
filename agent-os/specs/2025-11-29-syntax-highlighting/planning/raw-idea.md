# Raw Idea: Code Block Syntax Highlighting for chatsh

## Feature Description

Code block syntax highlighting for LLM responses in chatsh. This should work seamlessly with streaming responses.

## Key Requirements from Plan

- Implement syntax highlighting for chatsh CLI tool using shiki
- Must work with streaming output (buffered approach for code blocks)
- Port OpenCode theme to ANSI colors for terminal
- Use marked for markdown parsing, shiki for syntax highlighting
- Implement buffered stream transformer to handle code blocks without breaking streaming UX

## Reference Files

- Implementation plan exists at: `/home/joao/Work/copilot-scripts/PLAN_SYNTAX_HIGHLIGHTING.md`
- OpenCode project references for theme/architecture
