# copilot-scripts

CLI tools for AI code assistance via GitHub Copilot API. Terminal-native, Unix-composable.

## Features

- **Terminal-Native**: No GUI, runs in SSH/tmux/headless environments
- **Stateful Conversations**: Context maintained across interactions
- **Streaming Responses**: Real-time SSE output
- **Model Selection**: Aliases (g/c/o) + specific model IDs
- **Auto Token Caching**: OAuth device flow, local persistence

## Installation

```bash
bun install -g copilot-scripts
```

Or run directly:
```bash
bun src/tools/chatsh.ts
bun src/tools/holefill.ts myfile.ts
bun src/tools/refactor.ts myfile.ts
```

## Setup

### GitHub Authentication

On first run, tools initiate OAuth device flow:
1. Visit displayed GitHub URL
2. Enter code shown in terminal
3. Token cached at `~/.config/copilot-scripts/tokens.json`
4. Auto-refresh on expiration

### Quick Access Scripts

Create `~/bin` wrappers:

```bash
mkdir -p ~/bin

# Create chatsh wrapper
cat > ~/bin/chatsh << 'EOF'
#!/bin/bash
exec bun ~/copilot-scripts/src/tools/chatSH.ts "$@"
EOF

# Create holefill wrapper
cat > ~/bin/holefill << 'EOF'
#!/bin/bash
exec bun ~/copilot-scripts/src/tools/holefill.ts "$@"
EOF

# Create refactor wrapper
cat > ~/bin/refactor << 'EOF'
#!/bin/bash
exec bun ~/copilot-scripts/src/tools/refactor.ts "$@"
EOF

chmod +x ~/bin/chatsh ~/bin/holefill ~/bin/refactor
```

Add to PATH:
```bash
# ~/.bashrc or ~/.zshrc
export PATH="$HOME/bin:$PATH"
```

## Tools

### 1. ChatSH - Interactive Terminal Chat

ChatGPT-like experience in terminal with shell execution.

**Features:**
- Interactive REPL conversations
- AI suggests/executes bash commands (with confirmation)
- User executes commands with `!command`
- Conversation history logged to `~/.copilot-scripts/chatsh_history/`

**Usage:**
```bash
chatsh [model]

# Examples
chatsh              # Default model (gpt-4o)
chatsh c            # Claude 3.5 Sonnet
chatsh o            # GPT-4o
```

**Example Interaction:**
```bash
$ chatsh
GPT-4o (gpt-4o)
> What files are in this directory?

I'll check the directory contents.

<RUN>
ls -la
</RUN>

Run this command? (y/n): y

[command output shown]

> Create a hello world script in TypeScript
```

### 2. HoleFill - Code Completion

Fill code placeholders (`.?.`) using AI context.

**Features:**
- Preserves indentation and style
- Inline imports via `//./path//`, `{-./path-}`, `#./path#` syntax
- Logs to `~/.copilot-scripts/holefill_history/`
- Hole must be at column 0

**Usage:**
```bash
holefill <file> [model]

# Examples
holefill app.ts              # Default model
holefill app.ts c            # Claude 3.5 Sonnet
holefill component.tsx o     # GPT-4o
```

**Example:**

`app.ts`:
```typescript
function fibonacci(n: number): number {
  .?.
}
```

After `holefill app.ts`:
```typescript
function fibonacci(n: number): number {
  if (n <= 1) return n;
  return fibonacci(n - 1) + fibonacci(n - 2);
}
```

**Inline Imports:**

`app.mini.ts`:
```typescript
//./src/types.ts//

function processUser(user: User) {
  .?.
}
```

The `//./src/types.ts//` line replaced with file contents when sending to AI.

### 3. Refactor - Large-Scale Code Editing

AI-powered refactoring with context compaction.

**Features:**
- Two-phase: compacting (identify relevant code) + editing
- Splits files into numbered blocks
- Token budget management
- Supports write/patch/delete operations
- Multi-file transformation support

**Usage:**
```bash
refactor <file> [model]

# Examples
refactor src/app.ts              # Default model
refactor src/app.ts c            # Claude 3.5 Sonnet
refactor "src/**/*.ts" o         # All TS files with GPT-4o
```

**How it works:**
1. **Context Collection**:
   - Recursively crawls imports in the target file (relative imports).
   - **Reverse Dependency Search**: Uses `ripgrep` (if installed) to find other files that import the target file, adding them to the context. This allows the AI to fix call-sites in other files when you change a function signature.
2. **Compacting Phase**: AI identifies blocks relevant to your task.
3. **Editing Phase**: AI edits necessary blocks.
4. **Output**: Structured patches or full rewrites.

**Interactive Prompts:**
```bash
$ refactor src/app.ts
Model: GPT-4o

Files: src/app.ts (1234 tokens)

Task: Rename function getUserData to fetchUserProfile

[Compacting phase...]
Omitted 45 irrelevant blocks

[Editing phase...]
<patch block="12">
export async function fetchUserProfile(id: string) {
</patch>

<patch block="34">
  const profile = await fetchUserProfile(userId);
</patch>

Apply changes? (y/n):
```

## Model Specification

**Format:** `alias` or `vendor:model_name`

**Aliases:**
- `c` - Claude 3.5 Sonnet
- `g` - GPT-4
- `i` - Gemini 1.5 Pro
- `o` - GPT-4o (default)

**Examples:**
- `gpt-4o`
- `claude-3-5-sonnet-20241022`
- `gemini-1.5-pro-002`

## Neovim Integration (0.10+)

Integrate tools into Neovim workflow.

### Installation

`~/.config/nvim/lua/copilot-scripts.lua`:
```lua
local M = {}

-- HoleFill: Complete code at cursor placeholder
function M.hole_fill()
  local filepath = vim.api.nvim_buf_get_name(0)
  if filepath == "" then
    vim.notify("Buffer has no file", vim.log.levels.ERROR)
    return
  end

  vim.cmd('write')
  local cmd = string.format('holefill "%s"', filepath)

  vim.notify("Running HoleFill...", vim.log.levels.INFO)

  vim.fn.jobstart(cmd, {
    on_exit = function(_, exit_code)
      if exit_code == 0 then
        vim.cmd('edit!')
        vim.notify("HoleFill completed!", vim.log.levels.INFO)
      else
        vim.notify("HoleFill failed", vim.log.levels.ERROR)
      end
    end,
  })
end

-- ChatSH: Open terminal with AI chat
function M.chat(model)
  model = model or "o"
  local cmd = string.format('chatsh %s', model)
  vim.cmd('split | terminal ' .. cmd)
  vim.cmd('startinsert')
end

-- Refactor: AI-powered refactoring
function M.refactor(model)
  local filepath = vim.api.nvim_buf_get_name(0)
  if filepath == "" then
    vim.notify("Buffer has no file", vim.log.levels.ERROR)
    return
  end

  vim.cmd('write')

  model = model or "o"
  local cmd = string.format('refactor "%s" %s', filepath, model)

  vim.cmd('split | terminal ' .. cmd)
  vim.cmd('startinsert')
end

return M
```

`~/.config/nvim/init.lua`:
```lua
local copilot = require('copilot-scripts')

-- Key mappings
vim.keymap.set('n', '<leader>af', copilot.hole_fill, { desc = 'AI: Fill hole' })
vim.keymap.set('n', '<leader>ac', function() copilot.chat('c') end, { desc = 'AI: Chat (Claude)' })
vim.keymap.set('n', '<leader>ao', function() copilot.chat('o') end, { desc = 'AI: Chat (GPT-4o)' })

-- Refactor mappings (matching different models)
vim.keymap.set('n', '<leader>arc', function() copilot.refactor('c') end, { desc = 'Refactor: Claude' })
vim.keymap.set('n', '<leader>arg', function() copilot.refactor('g') end, { desc = 'Refactor: GPT-4' })
vim.keymap.set('n', '<leader>aro', function() copilot.refactor('o') end, { desc = 'Refactor: GPT-4o' })
vim.keymap.set('n', '<leader>ari', function() copilot.refactor('i') end, { desc = 'Refactor: Gemini' })
```

### Usage in Neovim

**Code Completion:**
1. Type `.?.` where code completion needed
2. Press `<leader>af`
3. Buffer reloads with completed code

**Chat:**
- `<leader>ac` - Claude 3.5 Sonnet chat
- `<leader>ao` - GPT-4o chat

**Refactoring:**
1. Open file to refactor
2. Press `<leader>ar`
3. Enter task in terminal
4. Review and apply changes

## Thinking Tokens

You might notice that unlike the original `AI-scripts` (which uses direct vendor APIs), `copilot-scripts` does **not** currently display the dim-colored "thinking" or "reasoning" traces for models like Gemini or Claude.

**Why?**
- `copilot-scripts` uses the **GitHub Copilot API** as a proxy.
- Currently, the GitHub Copilot API **hides** the raw reasoning tokens from the response stream for most models.
- While models like `gpt-5-mini` or `claude-sonnet-4.5` might perform reasoning internally (and even report `reasoning_tokens` usage), the actual text of that thought process is not streamed back to the client by the API.
- The VS Code Copilot Chat extension displays thinking traces using internal/privileged protocols ("Agent Mode") that are not yet fully exposed in the standard public API endpoint used by this tool.

I will try to enable thinking traces as soon as the Copilot API exposes them for standard consumers.

## Architecture

```
Tools (CLI entry points: chatsh, holefill, refactor)
  ↓
Core (CopilotChatInstance, ModelResolver)
  ↓
Services (Auth, Copilot, FileSystem, Log)
  ↓
API/Utils (streaming, tokenizer)
```

## Development

**Requirements:**
- Bun 1.0+
- TypeScript 5.9+
- GitHub account (for Copilot API)

**Install:**
```bash
bun install
```

**Type-check:**
```bash
bun run typecheck
```

**Test:**
```bash
bun test
```

## Security

**Token Storage:**
- Location: `~/.config/copilot-scripts/tokens.json`
- Permissions: 0600 (user read/write only)
- Never logged, only sent to GitHub API

**Input Validation:**
- All external inputs validated
- No shell injection in command execution
- API responses validated against schemas

## Inspiration

Inspired by [Taelin AI Scripts](https://github.com/VictorTaelin/ai-scripts) - adapted for GitHub Copilot API.

## License

MIT - See LICENSE file
