import { highlightCode } from "./syntax-highlighter";

type State = "NORMAL" | "CODE_FENCE_OPENING" | "CODE_BLOCK";

export class StreamBuffer {
  private state: State = "NORMAL";
  private lineBuffer: string = ""; // Current incomplete line in code block
  private language: string | null = null;
  private pendingChunk: string = "";

  constructor(private onWrite: (text: string) => void) {}

  async write(chunk: string): Promise<void> {
    this.pendingChunk += chunk;

    while (this.pendingChunk.length > 0) {
      const processed = await this.processChunk();
      if (!processed) {
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
      return await this.processCodeBlockState();
    }
  }

  private async processNormalState(): Promise<boolean> {
    // Look for complete fence pattern: ``` at start of line followed by optional language and newline
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
      this.lineBuffer = "";
      // Skip past the entire fence line including newline
      const fenceLineEnd =
        fenceIndex + fenceMatch[0].length - (fenceMatch[1] === "\n" ? 1 : 0);
      this.pendingChunk = this.pendingChunk.substring(fenceLineEnd);
      return true;
    }

    // Check for partial fence that needs more data (``` possibly followed by language, no newline yet)
    const partialFenceMatch = this.pendingChunk.match(/(^|\n)```\w*$/);
    if (partialFenceMatch) {
      const fenceIndex =
        partialFenceMatch.index! + (partialFenceMatch[1] === "\n" ? 1 : 0);
      // Write everything before the partial fence
      if (fenceIndex > 0) {
        this.onWrite(this.pendingChunk.substring(0, fenceIndex));
      }
      this.pendingChunk = this.pendingChunk.substring(fenceIndex);
      this.state = "CODE_FENCE_OPENING";
      return false;
    }

    // Check if trailing chars could be partial fence (` or ``)
    const trailingFenceMatch = this.pendingChunk.match(/(\n`{1,2}|^`{1,2})$/);

    if (trailingFenceMatch) {
      const safeEnd = trailingFenceMatch.index!;
      if (safeEnd > 0) {
        this.onWrite(this.pendingChunk.substring(0, safeEnd));
      }
      this.pendingChunk = this.pendingChunk.substring(safeEnd);
      return false;
    }

    // No fence - write everything
    this.onWrite(this.pendingChunk);
    this.pendingChunk = "";
    return false;
  }

  private async processCodeFenceOpeningState(): Promise<boolean> {
    const newlineIndex = this.pendingChunk.indexOf("\n");

    if (newlineIndex === -1) {
      return false;
    }

    // Extract language from the fence line
    const fenceLine = this.pendingChunk.substring(0, newlineIndex);
    const langMatch = fenceLine.match(/^```(\w*)/);
    if (langMatch) {
      this.language = langMatch[1] || null;
    }

    // Transition to CODE_BLOCK
    this.state = "CODE_BLOCK";
    this.lineBuffer = "";
    this.pendingChunk = this.pendingChunk.substring(newlineIndex + 1);
    return true;
  }

  private async processCodeBlockState(): Promise<boolean> {
    // Strategy: Process line by line, highlight and output each complete line immediately
    // Only buffer the current incomplete line
    // Watch for closing fence at the start of a line

    // Check if we have a complete line (or closing fence)
    const newlineIndex = this.pendingChunk.indexOf("\n");

    if (newlineIndex === -1) {
      // No complete line yet - check if this could be start of closing fence
      const combined = this.lineBuffer + this.pendingChunk;

      // If the line so far looks like it could be a closing fence, hold back
      if (/^`{1,3}[ \t]*$/.test(combined)) {
        this.lineBuffer = combined;
        this.pendingChunk = "";
        return false;
      }

      // Not a potential closing fence - accumulate in line buffer
      this.lineBuffer += this.pendingChunk;
      this.pendingChunk = "";
      return false;
    }

    // We have a newline - extract the complete line
    const lineContent = this.pendingChunk.substring(0, newlineIndex);
    const fullLine = this.lineBuffer + lineContent;
    this.pendingChunk = this.pendingChunk.substring(newlineIndex + 1);
    this.lineBuffer = "";

    // Check if this line is the closing fence
    if (/^```[ \t]*$/.test(fullLine)) {
      // Closing fence found - transition back to NORMAL
      this.state = "NORMAL";
      this.language = null;
      return true;
    }

    // Not a closing fence - highlight and output this line
    const highlighted = await highlightCode(
      fullLine,
      this.language || "text",
    );
    this.onWrite(highlighted + "\n");

    return true;
  }

  async flush(): Promise<void> {
    if (this.state === "CODE_BLOCK" && this.lineBuffer.length > 0) {
      // Unclosed code block with remaining content - write highlighted
      const highlighted = await highlightCode(
        this.lineBuffer,
        this.language || "text",
      );
      this.onWrite(highlighted);
    }

    if (this.pendingChunk.length > 0) {
      this.onWrite(this.pendingChunk);
    }

    // Reset all state
    this.state = "NORMAL";
    this.lineBuffer = "";
    this.language = null;
    this.pendingChunk = "";
  }
}
