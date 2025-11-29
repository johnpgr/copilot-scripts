import { type HighlighterGeneric } from "shiki";

let highlighter: HighlighterGeneric<any, any> | null = null;
let warmupPromise: Promise<void> | null = null;

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

function normalizeLanguage(lang: string): string {
  const normalized = lang.toLowerCase();
  return LANGUAGE_ALIASES[normalized] || normalized;
}

function colorToAnsi(hex: string): string {
  // Convert hex color to ANSI 24-bit color code
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `\x1b[38;2;${r};${g};${b}m`;
}

async function getOrInitHighlighter(): Promise<HighlighterGeneric<any, any>> {
  if (highlighter) {
    return highlighter;
  }

  if (warmupPromise) {
    await warmupPromise;
    if (highlighter) {
      return highlighter;
    }
  }

  const { getSingletonHighlighter } = await import("shiki");
  highlighter = await getSingletonHighlighter({
    themes: ["github-dark"],
    langs: [
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
      "text",
    ],
  });

  return highlighter;
}

export async function warmupHighlighter(): Promise<void> {
  if (warmupPromise) {
    return warmupPromise;
  }

  warmupPromise = getOrInitHighlighter().then(() => {});
  return warmupPromise;
}

export async function highlightCode(
  code: string,
  lang: string,
): Promise<string> {
  try {
    const normalizedLang = normalizeLanguage(lang);
    const hl = await getOrInitHighlighter();

    const tokens = await hl.codeToTokens(code, {
      lang: normalizedLang,
      theme: "github-dark",
    });

    let result = "";
    const reset = "\x1b[0m";

    for (const line of tokens.tokens) {
      for (const token of line) {
        if (token.color) {
          result += colorToAnsi(token.color) + token.content + reset;
        } else {
          result += token.content;
        }
      }
      result += "\n";
    }

    // Remove trailing newline if original didn't have one
    if (!code.endsWith("\n") && result.endsWith("\n")) {
      result = result.slice(0, -1);
    }

    return result;
  } catch (error) {
    // Fallback to unhighlighted code on any error
    return code;
  }
}
