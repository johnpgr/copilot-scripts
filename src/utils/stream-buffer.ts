import { highlightCode } from "./syntax-highlighter";

type State = "NORMAL" | "CODE_FENCE_OPENING" | "CODE_BLOCK";

export class StreamBuffer {
  private state: State = "NORMAL";
  private buffer: string = "";
  private language: string | null = null;
  private pendingChunk: string = "";

  constructor(private onWrite: (text: string) => void) {}

  async write(chunk: string): Promise<void> {
    this.pendingChunk += chunk;

    while (this.pendingChunk.length > 0) {
      const processed = await this.processChunk();
      if (!processed) {
        // No more complete lines to process
        break;
      }
    }
  }

  private async processChunk(): Promise<boolean> {
    if (this.state === "NORMAL") {
      return await this.processNormalState();
    } else if (this.state === "CODE_FENCE_OPENING") {
      return await this.processCodeFenceOpeningState();
    } else {
      // CODE_BLOCK
      return await this.processCodeBlockState();
    }
  }

  private async processNormalState(): Promise<boolean> {
    // Look for complete fence pattern: ``` at start of line (after newline or at position 0)
    // followed by optional language and newline
    const fenceMatch = this.pendingChunk.match(/(^|\n)```(\w*)(\n)/);

    if (fenceMatch) {
      const fenceIndex = fenceMatch.index! + (fenceMatch[1] === "\n" ? 1 : 0);

      // Write everything before the fence
      if (fenceIndex > 0) {
        this.onWrite(this.pendingChunk.substring(0, fenceIndex));
      }

      // Extract language if present
      this.language = fenceMatch[2] || null;

      // Complete fence line found, transition to CODE_BLOCK
      this.state = "CODE_BLOCK";
      this.buffer = "";
      // Skip past the entire fence line including newline
      const fenceLineEnd = fenceIndex + fenceMatch[0].length - (fenceMatch[1] === "\n" ? 1 : 0);
      this.pendingChunk = this.pendingChunk.substring(fenceLineEnd);
      return true;
    }
    
    // Check for partial fence that needs more data (``` possibly followed by language, no newline yet)
    const partialFenceMatch = this.pendingChunk.match(/(^|\n)```\w*$/);
    if (partialFenceMatch) {
      const fenceIndex = partialFenceMatch.index! + (partialFenceMatch[1] === "\n" ? 1 : 0);
      // Write everything before the partial fence
      if (fenceIndex > 0) {
        this.onWrite(this.pendingChunk.substring(0, fenceIndex));
      }
      this.pendingChunk = this.pendingChunk.substring(fenceIndex);
      this.state = "CODE_FENCE_OPENING";
      return false;
    }

    // No complete fence found - but check if trailing chars could be partial fence
    // A partial fence could be: ` or `` at end (not yet 3 backticks)
    const trailingFenceMatch = this.pendingChunk.match(/(\n`{1,2}|^`{1,2})$/);

    if (trailingFenceMatch) {
      // Potential partial fence at end - hold it back
      const safeEnd = trailingFenceMatch.index!;
      if (safeEnd > 0) {
        this.onWrite(this.pendingChunk.substring(0, safeEnd));
      }
      this.pendingChunk = this.pendingChunk.substring(safeEnd);
      return false;
    }

    // No fence and no potential partial fence - write everything
    this.onWrite(this.pendingChunk);
    this.pendingChunk = "";
    return false;
  }

  private async processCodeFenceOpeningState(): Promise<boolean> {
    const newlineIndex = this.pendingChunk.indexOf("\n");

    if (newlineIndex === -1) {
      // Still waiting for complete fence line
      return false;
    }

    // Extract language from the fence line (everything before the newline)
    const fenceLine = this.pendingChunk.substring(0, newlineIndex);
    const langMatch = fenceLine.match(/^```(\w*)/);
    if (langMatch) {
      this.language = langMatch[1] || null;
    }

    // Fence line complete, transition to CODE_BLOCK
    this.state = "CODE_BLOCK";
    this.buffer = "";
    this.pendingChunk = this.pendingChunk.substring(newlineIndex + 1);
    return true;
  }

  private async processCodeBlockState(): Promise<boolean> {
    // Look for closing fence: ``` at start of a line, followed by end of line or end of chunk
    // The closing fence pattern: newline + ``` + (optional whitespace) + (newline or end)
    // We need to check both in pendingChunk and at the boundary between buffer and pendingChunk
    
    // First, check if buffer ends with \n and pendingChunk starts with potential closing fence
    const bufferEndsWithNewline = this.buffer.endsWith("\n");
    
    if (bufferEndsWithNewline) {
      // Check if pendingChunk starts with closing fence
      const startCloseFenceMatch = this.pendingChunk.match(/^```[ \t]*(\n|$)/);
      if (startCloseFenceMatch) {
        // Found closing fence at start of pendingChunk (after newline in buffer)
        // Highlight and write the code block (remove trailing newline from buffer)
        const highlighted = await highlightCode(
          this.buffer.slice(0, -1),
          this.language || "text",
        );
        this.onWrite(highlighted);

        // Skip past the closing fence line
        const fenceEndIndex = startCloseFenceMatch[0].length;
        this.pendingChunk = this.pendingChunk.substring(fenceEndIndex);

        // Reset state
        this.state = "NORMAL";
        this.buffer = "";
        this.language = null;

        return true;
      }
      
      // Check for partial closing fence at start of pendingChunk
      const partialStartMatch = this.pendingChunk.match(/^`{1,2}$|^```[ \t]*$/);
      if (partialStartMatch) {
        // Hold back - might be start of closing fence
        return false;
      }
    }
    
    // Check for closing fence within pendingChunk
    const closeFenceMatch = this.pendingChunk.match(/\n```[ \t]*(\n|$)/);

    if (closeFenceMatch) {
      const closeFenceIndex = closeFenceMatch.index! + 1; // +1 to skip the \n

      // Add everything before closing fence to buffer
      this.buffer += this.pendingChunk.substring(0, closeFenceMatch.index!);

      // Highlight and write the code block
      const highlighted = await highlightCode(
        this.buffer,
        this.language || "text",
      );
      this.onWrite(highlighted);

      // Skip past the closing fence line
      const afterCloseFence = this.pendingChunk.substring(closeFenceIndex);
      const newlineIndex = afterCloseFence.indexOf("\n");

      if (newlineIndex === -1) {
        // Closing fence is at end of chunk
        this.pendingChunk = "";
      } else {
        this.pendingChunk = afterCloseFence.substring(newlineIndex + 1);
      }

      // Reset state
      this.state = "NORMAL";
      this.buffer = "";
      this.language = null;

      return true;
    }

    // No complete closing fence found - check for partial closing fence at end
    // Could be: \n` or \n`` or \n``` (without confirming newline/end after)
    const partialCloseMatch = this.pendingChunk.match(/\n`{1,3}[ \t]*$/);

    if (partialCloseMatch) {
      // Hold back the potential partial closing fence
      const safeEnd = partialCloseMatch.index!;
      this.buffer += this.pendingChunk.substring(0, safeEnd + 1); // Include the \n
      this.pendingChunk = this.pendingChunk.substring(safeEnd + 1); // Keep backticks in pending
      return false;
    }

    // No closing fence and no potential partial - accumulate in buffer
    this.buffer += this.pendingChunk;
    this.pendingChunk = "";
    return false;
  }

  async flush(): Promise<void> {
    if (this.state === "CODE_BLOCK" && this.buffer.length > 0) {
      // Unclosed code block, write unhighlighted
      this.onWrite(this.buffer);
    }

    if (this.pendingChunk.length > 0) {
      this.onWrite(this.pendingChunk);
    }

    // Reset all state
    this.state = "NORMAL";
    this.buffer = "";
    this.language = null;
    this.pendingChunk = "";
  }
}
