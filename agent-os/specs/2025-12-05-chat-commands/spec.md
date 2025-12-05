# Specification: Chat Commands (Model Switcher)

## Goal
Implement an interactive `/model` command in `chatsh` that triggers a dropdown menu of available AI models, allowing users to dynamically switch the active model during a conversation without restarting.

## User Stories
- As a CLI user, I want to see available commands when I type `/` so I can quickly access tools without context switching.
- As a CLI user, I want to browse and select a different AI model (e.g., from GPT-4 to Claude) using a visual menu so I don't have to memorize complex model IDs.
- As a CLI user, I want to switch the active model mid-conversation so I can use specialized models for specific tasks (e.g., reasoning vs. coding).

## Specific Requirements

**Input Mode Refactoring**
- Replace standard `readline` line-buffering with raw mode input handling to intercept individual keystrokes.
- Detect the `/` character at the start of a line to immediately trigger "Command Mode".
- Maintain standard text editing behavior (backspace, typing) when not in command mode.

**Command Mode UI**
- Render a dropdown menu *below* the current input line using ANSI escape codes.
- Display a filtered list of commands (initially only `/model`) based on user input.
- Allow exiting command mode via `Esc` or backspacing the leading `/`.

**Model Command Logic**
- Trigger the model list view when `/model` is typed or selected.
- Fetch available models via `ModelResolver` and cache them for the session duration.
- Filter the model list dynamically as the user continues typing (e.g., `/model cla` -> filters to Claude models).
- Filter out non-chat models (e.g., embedding models) if not already handled by `ModelResolver`.

**Selection & Navigation**
- Support `Up` and `Down` arrow keys to navigate the dropdown selection.
- Support `Enter` to confirm the selected model.
- Highlight the currently selected item in the dropdown (e.g., inverted colors or cyan text).

**Model Switching Action**
- Update the `CopilotChatInstance` with the new selected `CopilotModel`.
- Print a system message to the console confirming the change (e.g., `> Active model switched to: gpt-4o`).
- Return to the standard chat prompt ready for the next input.

## Visual Design
No mockups provided, but following the "aider" CLI style:
- A simple list rendered below the cursor.
- Selected item highlighted.
- List clears/disappears upon selection or cancellation.

## Existing Code to Leverage

**`src/core/model-resolver.ts`**
- Use `ModelResolver.make` and internal logic to fetch models.
- Reuse the `CopilotModel` type definition.

**`src/tools/chatsh.ts`**
- Refactor the `runChat` input loop to support the new TUI mode.
- Reuse the `CopilotChatInstance` for managing conversation state.

**`src/services/CopilotService.ts`**
- Reuse `CopilotService` for the underlying API calls to fetch models.

## Out of Scope
- Persistent configuration changes (default model remains the same for next run).
- Additional commands like `/help`, `/clear`, or `/system`.
- Mouse interaction support.
- Heavy UI libraries (implementation should remain lightweight/native where possible).
