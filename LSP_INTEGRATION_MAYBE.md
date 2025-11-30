# Future Upgrade: LSP Integration

Integrating a Language Server Protocol (LSP) client into `copilot-scripts` would massively upgrade its capabilities, moving it from "regex-based heuristics" to "semantic understanding". Since `copilot-scripts` is a CLI tool (built with Bun/Node), it can act as an LSP Client that connects to an existing LSP Server (like `tsserver`, `pyright`, `rust-analyzer`, etc.).

## Benefits of LSP Integration

### 1. Semantic "Find References" (Perfect Reverse Dependencies)
*   **Current**: `ripgrep` searches for the filename string. It finds false positives (comments, other files with same name) and misses complex imports (re-exports, dynamic imports).
*   **LSP Upgrade**: Use `textDocument/references`. The LSP knows *exactly* which files import and use the symbols from your current file.
*   **Benefit**: 100% accurate context collection. Only include files that *actually* use the code you are refactoring.

### 2. Precise "Go to Definition" (Deep Context)
*   **Current**: Regex-based import crawling (`import ... from "./utils"`). It fails on aliases (`@/utils`), `tsconfig` paths, monorepo packages, and complex re-exports.
*   **LSP Upgrade**: Use `textDocument/definition`.
*   **Benefit**: The tool can "see" exactly where a function is defined, even if it's in `node_modules` (if we allowed it) or aliased paths, without fragile path resolution logic.

### 3. Symbol-Aware Compaction
*   **Current**: The "Compacting Phase" uses an LLM to decide what blocks are relevant. This is slow and costs tokens.
*   **LSP Upgrade**:
    *   Query `textDocument/documentSymbol` to get the outline of the file (functions, classes).
    *   We can intelligently split blocks by *symbol* (function boundaries) rather than just double-newlines.
    *   We can filter blocks based on usage. If the task is "Rename `foo`", we can ask LSP for all references to `foo` and *only* include those blocks in the prompt, potentially **skipping the LLM compaction phase entirely** or making it much cheaper.

### 4. Diagnostics & Error Checking (Auto-Fixing)
*   **Current**: The tool applies a patch and hopes it compiles. The user has to run `tsc` manually afterwards.
*   **LSP Upgrade**:
    *   After applying the patch, the tool can query `textDocument/publishDiagnostics`.
    *   It can immediately see if the refactor caused new errors (e.g., "Argument of type X is not assignable to Y").
    *   **Auto-Repair Loop**: If errors are found, the tool can feed those specific errors back to the LLM: "Your previous edit caused these errors: ... Please fix." This creates a powerful agentic loop.

### 5. Safe Renaming
*   **Current**: The LLM guesses what to find/replace.
*   **LSP Upgrade**: Use `textDocument/rename`. The LSP can perform the rename across the *entire project* perfectly in milliseconds. The LLM can then focus on the *logic* changes that a simple rename can't handle.

### 6. Type Information in Prompt
*   **Current**: The LLM sees raw text.
*   **LSP Upgrade**:
    *   We can "hover" (`textDocument/hover`) over variables in the relevant code and inject their **inferred types** into the prompt.
    *   Example prompt injection: `// Note: 'user' variable has type '{ id: string, name: string }'`
    *   **Benefit**: The LLM makes fewer hallucinated type errors because it knows the exact types even if they are inferred and not written in the file.

## Implementation Strategy

To implement this, `copilot-scripts` would need an **LSP Client** module.

1.  **Library**: Use `vscode-languageserver-protocol` (node) or a lighter-weight JSON-RPC client.
2.  **Connection**: Spawn the language server (e.g., `typescript-language-server --stdio`) and communicate via stdin/stdout.
3.  **Challenges**:
    *   **Startup Latency**: LSPs are stateful and heavy. Starting one up for a short-lived CLI command might be too slow.
    *   **Solution**: Implement a background daemon that keeps the LSP alive, or investigate connecting to an existing editor's LSP session (though no standard protocol exists for this "hijacking").
