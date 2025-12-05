# Task Breakdown: Chat Commands (Model Switcher)

## Overview
Total Tasks: 11

## Task List

### Core Logic & Services

#### Task Group 1: Model Caching & filtering
**Dependencies:** None

- [ ] 1.0 Implement Model Caching & Filtering Logic
  - [ ] 1.1 Write 2-4 focused tests for ModelResolver caching and filtering
    - Test caching mechanism works (subsequent calls don't hit API)
    - Test filtering logic (exclude embeddings, match search terms)
  - [ ] 1.2 Enhance ModelResolver with caching
    - Add memory cache to `resolve` or a new `listModels` method
    - Ensure cache lasts for session duration
  - [ ] 1.3 Implement model filtering utility
    - Filter by "chat" or "instruct" capabilities (if distinguishable in API response)
    - Implement fuzzy search/filtering helper for autocomplete
  - [ ] 1.4 Ensure Core Logic tests pass
    - Run ONLY the tests written in 1.1
    - Verify caching and filtering behavior

**Acceptance Criteria:**
- Model list is fetched once and cached
- Filtering correctly identifies relevant chat models
- Search utility accurately matches input strings

### TUI & Input Handling

#### Task Group 2: Input Loop Refactoring
**Dependencies:** Task Group 1

- [ ] 2.0 Refactor Chatsh Input Loop
  - [ ] 2.1 Write 2-4 focused tests for KeyPress handling (mocked stdin)
    - Test detecting `/` at start of line
    - Test standard text input accumulation
    - Test backspace handling
  - [ ] 2.2 Implement Raw Mode Input Handler
    - Replace `readline.question` with manual `process.stdin.setRawMode(true)` loop
    - Handle basic line editing (insert, backspace, left/right navigation)
    - Render current input line to stdout manually
  - [ ] 2.3 Implement Command Mode Detection
    - Detect leading `/` trigger
    - Switch state between "Chat Input" and "Command Input"
  - [ ] 2.4 Ensure Input Loop tests pass
    - Run ONLY the tests written in 2.1
    - Verify basic typing and mode switching works

**Acceptance Criteria:**
- Typing `/` immediately switches internal state
- Normal typing works identically to `readline` (visually)
- Raw mode handles basic navigation keys (Home, End, Left, Right)

#### Task Group 3: Dropdown UI Component
**Dependencies:** Task Group 2

- [ ] 3.0 Build Dropdown UI
  - [ ] 3.1 Write 2-4 focused tests for Dropdown rendering
    - Test rendering list below cursor
    - Test highlighting selection change
    - Test clearing menu from screen
  - [ ] 3.2 Implement Dropdown Renderer
    - Use ANSI escape codes to draw list *below* current input
    - Handle saving/restoring cursor position
  - [ ] 3.3 Implement Navigation Logic
    - Handle Up/Down arrow keys to change selection index
    - Handle Enter to confirm selection
    - Handle Esc to dismiss
  - [ ] 3.4 Ensure Dropdown tests pass
    - Run ONLY the tests written in 3.1
    - Verify UI renders and updates correctly without ghosting

**Acceptance Criteria:**
- Menu appears below prompt
- Up/Down arrows change highlighted item
- Menu clears cleanly upon selection/exit

### Integration

#### Task Group 4: /model Command Integration
**Dependencies:** Task Groups 1-3

- [ ] 4.0 Integrate /model Command
  - [ ] 4.1 Write 2-4 focused tests for Integration
    - Test selecting a model updates the chat instance
    - Test system message output upon switch
  - [ ] 4.2 Connect Dropdown to ModelResolver
    - Populate dropdown with cached models when `/model` is typed
    - Filter list as user types (e.g., `/model gp`)
  - [ ] 4.3 Implement Model Switching Action
    - On selection, update `CopilotChatInstance.model`
    - Print confirmation message (e.g., "Active model switched to...")
  - [ ] 4.4 Final Polish & Cleanup
    - Ensure prompt returns to normal state after command
    - Fix any cursor artifacts
  - [ ] 4.5 Ensure Integration tests pass
    - Run ONLY the tests written in 4.1
    - Verify end-to-end flow from typing `/` to model switch

**Acceptance Criteria:**
- Full flow works: `/` -> select model -> Enter -> Chat updates
- Correct feedback message displayed
- Chat context preserved with new model

### Testing

#### Task Group 5: Gap Analysis
**Dependencies:** Task Groups 1-4

- [ ] 5.0 Review and fill gaps
  - [ ] 5.1 Review all new tests
    - Ensure critical paths are covered (Input -> UI -> Logic -> Switch)
  - [ ] 5.2 Add up to 10 integration tests if needed
    - Focus on edge cases (e.g., empty model list, network failure during fetch)
    - Test behavior when switching back and forth
  - [ ] 5.3 Run all feature-specific tests
    - Verify stability of the new input loop

**Acceptance Criteria:**
- No regression in basic chat functionality
- New command works reliably
