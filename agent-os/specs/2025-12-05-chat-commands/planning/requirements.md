# Spec Requirements: 2025-12-05-chat-commands

## Initial Description
We need a chatsh in-chat command (initiated by `/` forward-slash), The first command to be implemented would be /model
This should have an autocomplete with the list of model ids available, or when we trigger this command a list of the models ids should be displayed and the user can choose one of them with the keyboard arrow keys

## Requirements Discussion

### First Round Questions

**Q1:** I assume the autocomplete UI should render a vertical list of options below the current input line. Is that correct, or do you have a specific TUI layout in mind (e.g., replacing the prompt, overlay)?
**Answer:** a dropdown menu like the one in the 'aider' cli tool

**Q2:** I'm thinking we should trigger the "command mode" detection immediately when the user types a leading `/`. Is that correct, or should we require the full command name before showing UI?
**Answer:** trigger as soon as the `/` is typed, end it as soon as the `/` is not followed by any of the command names.

**Q3:** I assume we should fetch the available models from the GitHub Copilot API dynamically. Should we cache this list for the duration of the session to make subsequent switches faster?
**Answer:** Cache it

**Q4:** I'm thinking that selecting a model should immediately switch the active model for the *current* conversation context and display a system message confirming the change. Is that correct?
**Answer:** Yes

**Q5:** I assume we should filter the API response to only show "chat" or "instruct" models and hide embedding models. Is that correct?
**Answer:** Yes

**Q6:** Are there any other commands (e.g., `/help`, `/clear`) we should include in this initial framework, or strictly focus on `/model` for now?
**Answer:** Focus on /model

### Existing Code to Reference
The user did not provide specific paths, but investigation revealed:
- **Input Handling**: `src/tools/chatsh.ts` uses standard `readline`. This will likely need significant refactoring to support immediate key interception (raw mode).
- **Model Logic**: `src/core/model-resolver.ts` handles model fetching and resolution.
- **No Visuals**: No visual assets were provided.

### Follow-up Questions
None needed. The technical path is clear (refactor input loop to support TUI elements).

## Visual Assets

### Files Provided:
No visual assets provided.

### Visual Insights:
- The user referenced 'aider' CLI tool's dropdown. This implies an overlay menu that appears *below* the cursor, navigable with arrow keys, closing on selection or cancellation.

## Requirements Summary

### Functional Requirements
- **Trigger**: Typing `/` at the start of input immediately enters "command mode".
- **UI**: A vertical dropdown menu appears below the cursor.
- **Command Support**: Initially only `/model` is supported.
- **Autocomplete**: As user types (e.g., `/mo`), the dropdown filters or highlights the matching command.
- **Model List**: When `/model` is selected or typed, a secondary list (or continued completion) shows available models.
- **Selection**: Arrow keys navigate the list; Enter selects.
- **Action**: Selecting a model switches the current session's active model and prints a confirmation.
- **Exit**: Backspacing matching characters or pressing Esc exits command mode.

### Reusability Opportunities
- Reuse `ModelResolver` for fetching models.
- Reuse `CopilotChatInstance` structure (update its `model` property).

### Scope Boundaries
**In Scope:**
- Refactoring `chatsh` input loop to support raw key interception.
- Implementing the dropdown TUI component.
- Implementing the `/model` command logic.
- Caching the model list in memory during the session.

**Out of Scope:**
- Other commands (`/help`, `/clear`, etc.).
- Persistent configuration changes (changing default model permanently).
- Complex TUI libraries (try to keep dependencies minimal or use lightweight solutions if possible).

### Technical Considerations
- **Input Handling**: Standard `readline` line buffering blocks immediate feedback. Implementation will likely require `process.stdin.setRawMode(true)` and manual key handling or a lightweight wrapper that allows this.
- **Terminal Output**: Need to handle cursor positioning (ANSI escape codes) to render the dropdown without messing up the chat history.
- **API**: GitHub Copilot `/models` endpoint is the source of truth.
