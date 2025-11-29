import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import type { BundledLanguage, HighlighterGeneric, BundledTheme } from "shiki";
import { HighlightError } from "../errors";

const LANGUAGE_ALIASES: Record<string, string> = {
  js: "javascript",
  ts: "typescript",
  py: "python",
  rb: "ruby",
  sh: "bash",
  yml: "yaml",
  md: "markdown",
  rs: "rust",
  kt: "kotlin",
  cs: "csharp",
};

const SUPPORTED_LANGUAGES = [
  "javascript",
  "typescript",
  "python",
  "java",
  "c",
  "cpp",
  "csharp",
  "go",
  "rust",
  "ruby",
  "php",
  "swift",
  "kotlin",
  "scala",
  "r",
  "bash",
  "shell",
  "powershell",
  "sql",
  "html",
  "css",
  "json",
  "yaml",
  "xml",
  "markdown",
  "plaintext",
] as const;

function normalizeLanguage(lang: string): string {
  const normalized = lang.toLowerCase();
  return LANGUAGE_ALIASES[normalized] || normalized;
}

function colorToAnsi(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `\x1b[38;2;${r};${g};${b}m`;
}

export interface SyntaxHighlighter {
  highlight: (code: string, lang: string) => Effect.Effect<string, HighlightError>;
}

export namespace SyntaxHighlighter {
  const initHighlighter = Effect.tryPromise({
    try: async () => {
      const { getSingletonHighlighter } = await import("shiki");
      return getSingletonHighlighter({
        themes: ["github-dark"],
        langs: [...SUPPORTED_LANGUAGES],
      });
    },
    catch: (err) => new HighlightError(`Failed to initialize highlighter: ${String(err)}`),
  });

  const cachedHighlighter = Effect.cached(initHighlighter);

  const getHighlighter = Effect.gen(function* () {
    const cached = yield* cachedHighlighter;
    return yield* cached;
  });

  export function create(): SyntaxHighlighter {
    return {
      highlight: (code, lang) =>
        Effect.gen(function* () {
          if (code === "") return "";

          const normalized = normalizeLanguage(lang);
          const hl = yield* getHighlighter;

          const loadedLangs = hl.getLoadedLanguages();
          const langToUse = loadedLangs.includes(normalized as BundledLanguage)
            ? normalized
            : "plaintext";

          const tokens = yield* Effect.try({
            try: () =>
              hl.codeToTokens(code, {
                lang: langToUse as BundledLanguage,
                theme: "github-dark",
              }),
            catch: (err) => new HighlightError(`Tokenization failed: ${String(err)}`),
          });

          const reset = "\x1b[0m";
          let result = "";

          for (const line of tokens.tokens) {
            for (const token of line) {
              result += Option.fromNullable(token.color)
                .pipe(Option.map((c) => colorToAnsi(c) + token.content + reset))
                .pipe(Option.getOrElse(() => token.content));
            }
            result += "\n";
          }

          if (!code.endsWith("\n") && result.endsWith("\n")) {
            result = result.slice(0, -1);
          }

          return result;
        }).pipe(
          Effect.catchAll((err) =>
            err._tag === "HighlightError"
              ? Effect.succeed(code)
              : Effect.succeed(code),
          ),
        ),
    };
  }
}

const defaultHighlighter = SyntaxHighlighter.create();

export const warmupHighlighter = (): Promise<void> =>
  Effect.runPromise(defaultHighlighter.highlight("", "text").pipe(Effect.asVoid));

export const highlightCode = (code: string, lang: string): Promise<string> =>
  Effect.runPromise(defaultHighlighter.highlight(code, lang));
