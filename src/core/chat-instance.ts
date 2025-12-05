import * as Stream from "effect/Stream";
import * as Effect from "effect/Effect";
import { chatStream, type ChatMessage } from "../api/chat.ts";
import type { CopilotModel } from "../api/models.ts";
import { CopilotService } from "../services/CopilotService.ts";
import { ApiError, AuthError, FsError, ParseError, HighlightError } from "../errors/index.ts";

export interface AskOptions {
  system?: string;
  temperature?: number;
  stream?: boolean;
  onChunk?: (chunk: string) => Effect.Effect<void, HighlightError>;
}

export class CopilotChatInstance {
  private history: ChatMessage[] = [];

  constructor(
    private copilot: CopilotService,
    private model: CopilotModel,
  ) {}

  ask(
    userMessage: string,
    options: AskOptions = {},
  ): Effect.Effect<string, ApiError | AuthError | FsError | ParseError | HighlightError> {
    const messages: ChatMessage[] = [];

    if (options.system) {
      messages.push({ role: "system", content: options.system });
    }

    messages.push(...this.history);
    messages.push({ role: "user", content: userMessage });

    const shouldStream = options.stream !== false;

    const stream = chatStream(this.copilot, this.model, messages,
      options.temperature !== undefined ? { temperature: options.temperature } : {},
    );

    const withSideEffects = shouldStream
      ? Stream.tap(
          stream,
          (chunk) =>
            options.onChunk
              ? options.onChunk(chunk)
              : Effect.sync(() => process.stdout.write(chunk)),
        )
      : stream;

    const aggregated = Stream.runFold(
      withSideEffects,
      "",
      (acc, chunk) => acc + chunk,
    );

    return Effect.map(aggregated, (fullResponse) => {
      if (shouldStream && fullResponse && !options.onChunk) {
        process.stdout.write("\n");
      }
      this.history.push({ role: "user", content: userMessage });
      this.history.push({ role: "assistant", content: fullResponse });
      return fullResponse;
    });
  }

  getHistory(): ChatMessage[] {
    return [...this.history];
  }

  clearHistory(): void {
    this.history = [];
  }

  setModel(model: CopilotModel): void {
    this.model = model;
  }
}
