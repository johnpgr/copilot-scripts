// Thin wrapper around gpt-tokenizer with a safe fallback when encodings are missing.
import * as GPTTokenizer from "gpt-tokenizer";
import * as Effect from "effect/Effect";

export function countTokens(text: string, tokenizer = "o200k_base"): number {
  const encode = (GPTTokenizer as any).encode;
  if (typeof encode === "function") {
    try {
      return encode(text, tokenizer as any).length;
    } catch {
      // Fall back to default encoding if a specific tokenizer is unavailable.
      try {
        return encode(text).length;
      } catch {
        // ignore and fall through
      }
    }
  }

  // Heuristic fallback: ~4 chars per token.
  return Math.ceil(text.length / 4);
}

export const countTokensEffect = (text: string, tokenizer = "o200k_base") =>
  Effect.sync(() => countTokens(text, tokenizer));
