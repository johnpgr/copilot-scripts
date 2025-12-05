import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Readline from "node:readline";
import path from "path";
import { fetchModels, type CopilotModel } from "../api/models.ts";
import { CopilotService } from "../services/CopilotService.ts";
import { FileSystem } from "../services/FileSystemService.ts";
import { ApiError, AuthError, FsError, ParseError } from "../errors/index.ts";

type ShortcutKey = "g" | "c" | "i" | "o";
type ShortcutConfig = Partial<Record<ShortcutKey, string>>;

const SHORTCUT_PATTERNS: Record<ShortcutKey, RegExp> = {
  g: /^gpt/i,
  c: /^claude/i,
  i: /^gemini/i,
  o: /^o\d/i,
};

const CONFIG_DIR = ".config/copilot-scripts";
const SHORTCUT_FILE = "model-shortcuts.json";

type ModelFetcher = (
  copilot: CopilotService,
) => Effect.Effect<CopilotModel[], ApiError | AuthError | FsError | ParseError>;

export class ModelResolver {
  private cache: { models: CopilotModel[]; expiresAt: number } | null = null;
  private shortcuts: ShortcutConfig;

  private constructor(
    private copilot: CopilotService,
    _fs: FileSystem,
    shortcuts: ShortcutConfig,
    private fetcher: ModelFetcher,
  ) {
    this.shortcuts = shortcuts;
  }

  static make(
    copilot: CopilotService,
    fs: FileSystem,
    options: {
      shortcuts?: ShortcutConfig;
      skipPrompt?: boolean;
      fetcher?: ModelFetcher;
    } = {},
  ): Effect.Effect<ModelResolver, ApiError | AuthError | FsError | ParseError> {
    return Effect.gen(function* (_) {
      const fetcher = options.fetcher ?? fetchModels;
      const models = yield* _(fetcher(copilot));
      const shortcuts = options.skipPrompt
        ? options.shortcuts ?? {}
        : yield* _(loadOrConfigureShortcuts(fs, models));
      const resolver = new ModelResolver(copilot, fs, shortcuts, fetcher);
      resolver.cache = { models, expiresAt: Date.now() + 5 * 60 * 1000 };
      return resolver;
    });
  }

  static filterModels(models: CopilotModel[], query: string): CopilotModel[] {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return models;
    return models.filter((model) =>
      ModelResolver.matchesQuery(model, normalized),
    );
  }

  static createForTesting(
    copilot: CopilotService,
    fs: FileSystem,
    models: CopilotModel[],
    shortcuts: ShortcutConfig = {},
    fetcher: ModelFetcher = fetchModels,
  ): ModelResolver {
    const resolver = new ModelResolver(copilot, fs, shortcuts, fetcher);
    resolver.cache = { models, expiresAt: Date.now() + 5 * 60 * 1000 };
    return resolver;
  }

  resolve(
    spec: string,
  ): Effect.Effect<CopilotModel, ApiError | AuthError | FsError | ParseError> {
    const normalized = spec.toLowerCase();

    return Effect.flatMap(this.getModels(), (models: CopilotModel[]) => {
      const configured = this.shortcuts[normalized as ShortcutKey];
      if (configured) {
        const found = models.find((m) => m.id === configured);
        if (found) return Effect.succeed(found);
      }

      const pattern = SHORTCUT_PATTERNS[normalized as ShortcutKey];
      if (pattern) {
        const found = models.find((m) => pattern.test(m.id));
        if (found) return Effect.succeed(found);
      }

      let found = models.find((m) => m.id === spec);
      if (found) return Effect.succeed(found);

      found = models.find(
        (m) =>
          m.id.toLowerCase().includes(normalized) ||
          m.name.toLowerCase().includes(normalized),
      );
      if (found) return Effect.succeed(found);

      return Effect.fail(
        new ApiError(
          `Model not found: ${spec}. Available models:\n${models.map((m) => `  ${m.id}`).join("\n")}`,
        ),
      );
    });
  }

  private getModels(): Effect.Effect<
    CopilotModel[],
    ApiError | AuthError | FsError | ParseError
  > {
    const now = Date.now();
    if (this.cache && now < this.cache.expiresAt) {
      return Effect.succeed(this.cache.models);
    }

    return Effect.map(this.fetcher(this.copilot), (models) => {
      this.cache = { models, expiresAt: Date.now() + 5 * 60 * 1000 };
      return models;
    });
  }

  listModels(): Effect.Effect<CopilotModel[], ApiError | AuthError | FsError | ParseError> {
    return this.getModels();
  }

  private static matchesQuery(model: CopilotModel, query: string): boolean {
    const haystack = `${model.id} ${model.name}`.toLowerCase();
    if (haystack.includes(query)) {
      return true;
    }
    return ModelResolver.subsequenceMatch(haystack, query);
  }

  private static subsequenceMatch(text: string, term: string): boolean {
    let offset = 0;
    for (const char of term) {
      const idx = text.indexOf(char, offset);
      if (idx === -1) {
        return false;
      }
      offset = idx + 1;
    }
    return true;
  }
}

const loadOrConfigureShortcuts = (
  fs: FileSystem,
  models: CopilotModel[],
): Effect.Effect<ShortcutConfig, FsError | ParseError> =>
  Effect.gen(function* (_) {
    const filePath = fs.join(process.env.HOME || "", CONFIG_DIR, SHORTCUT_FILE);
    const existing = yield* _(loadShortcuts(fs, filePath));
    if (Option.isSome(existing)) {
      return existing.value;
    }

    const defaults = computeDefaultShortcuts(models);
    const configured = yield* _(promptForShortcuts(models, defaults));
    yield* _(saveShortcuts(fs, filePath, configured));
    return configured;
  });

const loadShortcuts = (fs: FileSystem, filePath: string) =>
  Effect.gen(function* (_) {
    const exists = yield* _(fs.exists(filePath));
    if (!exists) {
      return Option.none<ShortcutConfig>();
    }
    const text = yield* _(fs.readFile(filePath));
    try {
      const parsed = JSON.parse(text) as ShortcutConfig;
      return Option.some(parsed);
    } catch {
      return Option.none<ShortcutConfig>();
    }
  });

const saveShortcuts = (
  fs: FileSystem,
  filePath: string,
  config: ShortcutConfig,
) =>
  Effect.gen(function* (_) {
    const dir = path.dirname(filePath);
    yield* _(fs.ensureDir(dir));
    const contents = JSON.stringify(config, null, 2);
    yield* _(fs.writeFile(filePath, contents));
  });

const computeDefaultShortcuts = (models: CopilotModel[]): ShortcutConfig =>
  Object.fromEntries(
    (Object.keys(SHORTCUT_PATTERNS) as ShortcutKey[])
      .map((key) => {
        const match = models.find((m) => SHORTCUT_PATTERNS[key].test(m.id));
        return match ? ([key, match.id] as const) : null;
      })
      .filter((entry): entry is [ShortcutKey, string] => entry !== null),
  ) as ShortcutConfig;

const promptForShortcuts = (
  models: CopilotModel[],
  defaults: ShortcutConfig,
): Effect.Effect<ShortcutConfig, never> =>
  Effect.async<ShortcutConfig, never>((resume) => {
    (async () => {
      console.log(
        "\nConfigure model shortcuts (press Enter to keep the suggested default):\n",
      );
      for (const [i, m] of models.entries()) {
        console.log(`[${i}] ${m.id} - ${m.name}`);
      }

      const rl = Readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });

      const ask = (question: string) =>
        new Promise<string>((resolve) => rl.question(question, resolve));

      const choose = async (key: ShortcutKey): Promise<string | undefined> => {
        const defaultId = defaults[key];
        const answer = (
          await ask(
            `Shortcut '${key}' model id or index [${defaultId ?? "skip"}]: `,
          )
        ).trim();

        if (!answer) return defaultId;
        const idx = Number(answer);
        if (!Number.isNaN(idx) && models[idx]) {
          return models[idx].id;
        }
        const found = models.find((m) => m.id === answer);
        if (found) return found.id;
        console.log("Invalid choice; keeping default.");
        return defaultId;
      };

      const keys = ["g", "c", "i", "o"] as const;
      const entries: [ShortcutKey, string][] = [];
      for (const key of keys) {
        const value = await choose(key);
        if (value !== undefined) {
          entries.push([key, value]);
        }
      }
      const result = Object.fromEntries(entries) as ShortcutConfig;

      rl.close();
      resume(Effect.succeed(result));
    })().catch((err) => {
      console.error("Failed to configure shortcuts:", err);
      resume(Effect.succeed(defaults));
    });
  });
