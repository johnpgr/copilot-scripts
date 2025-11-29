import * as Effect from "effect/Effect";
import * as Ref from "effect/Ref";
import * as Option from "effect/Option";
import { SyntaxHighlighter } from "./syntax-highlighter";
import { HighlightError } from "../errors";

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

export interface StreamBuffer {
  write: (chunk: string) => Effect.Effect<void, HighlightError>;
  flush: () => Effect.Effect<void, HighlightError>;
}

export namespace StreamBuffer {
  export function create(
    onWrite: (text: string) => void,
    highlighter: SyntaxHighlighter,
  ): Effect.Effect<StreamBuffer, never> {
    return Effect.gen(function* () {
      const ref = yield* Ref.make(initialState);

      const highlight = (code: string, lang: Option.Option<string>) =>
        highlighter.highlight(code, Option.getOrElse(lang, () => "plaintext"));

      const processNormalState = (
        current: BufferState,
      ): Effect.Effect<{ processed: boolean; next: BufferState }, HighlightError> =>
        Effect.gen(function* () {
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

      const processCodeFenceOpeningState = (
        current: BufferState,
      ): Effect.Effect<{ processed: boolean; next: BufferState }, HighlightError> =>
        Effect.gen(function* () {
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

      const processCodeBlockState = (
        current: BufferState,
      ): Effect.Effect<{ processed: boolean; next: BufferState }, HighlightError> =>
        Effect.gen(function* () {
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

      const processChunk = (
        current: BufferState,
      ): Effect.Effect<{ processed: boolean; next: BufferState }, HighlightError> => {
        if (current.state === "NORMAL") {
          return processNormalState(current);
        }
        if (current.state === "CODE_FENCE_OPENING") {
          return processCodeFenceOpeningState(current);
        }
        return processCodeBlockState(current);
      };

      const write = (chunk: string): Effect.Effect<void, HighlightError> =>
        Effect.gen(function* () {
          yield* Ref.update(ref, (s) => ({ ...s, pending: s.pending + chunk }));

          let shouldContinue = true;
          while (shouldContinue) {
            const current = yield* Ref.get(ref);
            if (current.pending.length === 0) break;

            const result = yield* processChunk(current);
            yield* Ref.set(ref, result.next);
            shouldContinue = result.processed;
          }
        });

      const flush = (): Effect.Effect<void, HighlightError> =>
        Effect.gen(function* () {
          const current = yield* Ref.get(ref);

          if (current.state === "CODE_BLOCK" && current.lineBuffer.length > 0) {
            const highlighted = yield* highlight(current.lineBuffer, current.language);
            onWrite(highlighted);
          }

          if (current.pending.length > 0) {
            onWrite(current.pending);
          }

          yield* Ref.set(ref, initialState);
        });

      return { write, flush };
    });
  }
}
