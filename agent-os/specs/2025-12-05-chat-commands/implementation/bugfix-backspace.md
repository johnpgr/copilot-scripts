# Bug Fix: Chatsh Backspace Handling

## Root Cause Analysis
The backspace functionality in `chatsh` is broken due to two issues in the `keypressHandler` function in `src/tools/chatsh.ts`:

1.  **Control Flow Fallthrough**: The `switch` statement handles special keys (like `backspace`, `left`, `right`) and uses `break`. However, `break` only exits the `switch` block. The code execution continues to the "text insertion" block immediately following the switch. This means that after processing a backspace (removing a character), the raw backspace character (often `\x7f`) is erroneously appended to the input buffer as if it were text.
2.  **Raw Key Interpretation**: In raw mode, some terminals send `\x7f` (DELETE) or `\x08` (BACKSPACE) which `readline` might not always map to `key.name === 'backspace'`, causing the switch case to be missed entirely, falling through directly to the text insertion.

## Fix Plan

### Step 1: Normalize Backspace Input
Ensure that raw backspace characters are correctly identified as the "backspace" key.

**Action**:
At the start of `keypressHandler`, check if `str` is `\x7f` or `\x08`. If so, explicitly set `key.name = 'backspace'`.

### Step 2: Prevent Fallthrough Insertion
Modify the control flow so that handling a special key prevents the default text insertion logic from running.

**Action**:
Refactor the `switch` cases to `return` immediately after handling the key, instead of `break`. This ensures the function exits before reaching the text insertion logic at the bottom.

## Implementation Steps

1.  Open `src/tools/chatsh.ts`.
2.  Locate `keypressHandler`.
3.  Add the normalization check at the top:
    ```typescript
    if (str === "\x7f" || str === "\x08") {
      key.name = "backspace";
    }
    ```
4.  Change all `break` statements inside the `switch` to `return`.
    - `case "backspace": ... return;`
    - `case "delete": ... return;`
    - `case "left": ... return;`
    - `case "right": ... return;`
    - `case "home": ... return;`
    - `case "end": ... return;`
    - `case "up": ... return;` (inside the if blocks)
    - `case "down": ... return;` (inside the if blocks)
5.  Verify that the text insertion logic at the bottom only runs if no special key was handled.

## Verification
- Run `chatsh`.
- Type "hello".
- Press Backspace.
- Expected: "hell" (cursor moves back, char removed, no weird artifacts).
- Previously: "hell?" (or similar, where ? is the unprintable del char).
