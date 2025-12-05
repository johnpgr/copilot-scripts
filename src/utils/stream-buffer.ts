import * as Effect from "effect/Effect";
import * as Ref from "effect/Ref";
import * as Option from "effect/Option";
import { SyntaxHighlighter } from "./syntax-highlighter.ts";
import { HighlightError } from "../errors/index.ts";

type State = "NORMAL" | "CODE_FENCE_OPENING" | "CODE_BLOCK";

interface BufferState {
  state: State;
  lineBuffer: string;
  language: Option.Option<string>;
  pending: string;
}

const initialState: BufferState = {
  state: "NORMAL",
  lineBuffer: "",
  language: Option.none(),
  pending: "",
};

export class StreamBuffer {
  private readonly onWrite: (text: string) => void;
  private readonly highlighter: SyntaxHighlighter;
  private readonly ref: Ref.Ref<BufferState>;

  private constructor(
    onWrite: (text: string) => void,
    highlighter: SyntaxHighlighter,
    ref: Ref.Ref<BufferState>,
  ) {
    this.onWrite = onWrite;
    this.highlighter = highlighter;
    this.ref = ref;
  }

  static create(
    onWrite: (text: string) => void,
    highlighter: SyntaxHighlighter,
  ): Effect.Effect<StreamBuffer, never> {
    return Effect.gen(function* () {
      const ref = yield* Ref.make(initialState);
      return new StreamBuffer(onWrite, highlighter, ref);
    });
  }

  private highlight(
    code: string,
    lang: Option.Option<string>,
  ): Effect.Effect<string, HighlightError> {
    return this.highlighter.highlight(
      code,
      Option.getOrElse(lang, () => "plaintext"),
    );
  }

  private processNormalState(
    current: BufferState,
  ): Effect.Effect<{ processed: boolean; next: BufferState }, HighlightError> {
    const { onWrite } = this;

    return Effect.gen(function* () {
      const fenceMatch = current.pending.match(/(^|\n)```(\w*)(\n)/);

      if (fenceMatch) {
        const fenceIndex = fenceMatch.index! + (fenceMatch[1] === "\n" ? 1 : 0);

        if (fenceIndex > 0) {
          onWrite(current.pending.substring(0, fenceIndex));
        }

        const lang = fenceMatch[2] || "";
        const fenceLineEnd =
          fenceIndex + fenceMatch[0].length - (fenceMatch[1] === "\n" ? 1 : 0);

        return {
          processed: true,
          next: {
            state: "CODE_BLOCK" as State,
            lineBuffer: "",
            language: lang ? Option.some(lang) : Option.none(),
            pending: current.pending.substring(fenceLineEnd),
          },
        };
      }

      const partialFenceMatch = current.pending.match(/(^|\n)```\w*$/);
      if (partialFenceMatch) {
        const fenceIndex =
          partialFenceMatch.index! + (partialFenceMatch[1] === "\n" ? 1 : 0);
        if (fenceIndex > 0) {
          onWrite(current.pending.substring(0, fenceIndex));
        }
        return {
          processed: false,
          next: {
            ...current,
            state: "CODE_FENCE_OPENING" as State,
            pending: current.pending.substring(fenceIndex),
          },
        };
      }

      const trailingFenceMatch = current.pending.match(/(\n`{1,2}|^`{1,2})$/);
      if (trailingFenceMatch) {
        const safeEnd = trailingFenceMatch.index!;
        if (safeEnd > 0) {
          onWrite(current.pending.substring(0, safeEnd));
        }
        return {
          processed: false,
          next: { ...current, pending: current.pending.substring(safeEnd) },
        };
      }

      onWrite(current.pending);
      return { processed: false, next: { ...current, pending: "" } };
    });
  }

  private processCodeFenceOpeningState(
    current: BufferState,
  ): Effect.Effect<{ processed: boolean; next: BufferState }, HighlightError> {
    return Effect.gen(function* () {
      const newlineIndex = current.pending.indexOf("\n");

      if (newlineIndex === -1) {
        return { processed: false, next: current };
      }

      const fenceLine = current.pending.substring(0, newlineIndex);
      const langMatch = fenceLine.match(/^```(\w*)/);
      const lang = langMatch?.[1] || "";

      return {
        processed: true,
        next: {
          state: "CODE_BLOCK" as State,
          lineBuffer: "",
          language: lang ? Option.some(lang) : Option.none(),
          pending: current.pending.substring(newlineIndex + 1),
        },
      };
    });
  }

  private processCodeBlockState(
    current: BufferState,
  ): Effect.Effect<{ processed: boolean; next: BufferState }, HighlightError> {
    const highlight = (code: string, lang: Option.Option<string>) =>
      this.highlight(code, lang);
    const onWrite = this.onWrite;

    return Effect.gen(function* () {
      const newlineIndex = current.pending.indexOf("\n");

      if (newlineIndex === -1) {
        const combined = current.lineBuffer + current.pending;

        if (/^`{1,3}[ \t]*$/.test(combined)) {
          return {
            processed: false,
            next: { ...current, lineBuffer: combined, pending: "" },
          };
        }

        return {
          processed: false,
          next: { ...current, lineBuffer: combined, pending: "" },
        };
      }

      const lineContent = current.pending.substring(0, newlineIndex);
      const fullLine = current.lineBuffer + lineContent;
      const remaining = current.pending.substring(newlineIndex + 1);

      if (/^```[ \t]*$/.test(fullLine)) {
        return {
          processed: true,
          next: {
            state: "NORMAL" as State,
            lineBuffer: "",
            language: Option.none(),
            pending: remaining,
          },
        };
      }

      const highlighted = yield* highlight(fullLine, current.language);
      onWrite(highlighted + "\n");

      return {
        processed: true,
        next: { ...current, lineBuffer: "", pending: remaining },
      };
    });
  }

  private processChunk(
    current: BufferState,
  ): Effect.Effect<{ processed: boolean; next: BufferState }, HighlightError> {
    if (current.state === "NORMAL") {
      return this.processNormalState(current);
    }
    if (current.state === "CODE_FENCE_OPENING") {
      return this.processCodeFenceOpeningState(current);
    }
    return this.processCodeBlockState(current);
  }

  write(chunk: string): Effect.Effect<void, HighlightError> {
    const self = this;
    return Effect.gen(function* () {
      yield* Ref.update(self.ref, (s) => ({ ...s, pending: s.pending + chunk }));

      let shouldContinue = true;
      while (shouldContinue) {
        const current = yield* Ref.get(self.ref);
        if (current.pending.length === 0) break;

        const result = yield* self.processChunk(current);
        yield* Ref.set(self.ref, result.next);
        shouldContinue = result.processed;
      }
    });
  }

  flush(): Effect.Effect<void, HighlightError> {
    const self = this;
    return Effect.gen(function* () {
      const current = yield* Ref.get(self.ref);

      if (current.state === "CODE_BLOCK" && current.lineBuffer.length > 0) {
        const highlighted = yield* self.highlight(
          current.lineBuffer,
          current.language,
        );
        self.onWrite(highlighted);
      }

      if (current.pending.length > 0) {
        self.onWrite(current.pending);
      }

      yield* Ref.set(self.ref, initialState);
    });
  }
}
