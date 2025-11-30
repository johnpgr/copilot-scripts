import { encode } from "gpt-tokenizer";

export function countTokens(text: string): number {
  try {
    return encode(text).length;
  } catch {
    // Heuristic fallback: ~4 chars per token.
    return Math.ceil(text.length / 4);
  }
}
