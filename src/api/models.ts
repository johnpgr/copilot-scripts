import * as Effect from "effect/Effect";
import { Schema } from "effect";
import { CopilotService } from "../services/CopilotService.ts";
import { ModelsResponse } from "../schemas/index.ts";
import { ParseError } from "../errors/index.ts";

export interface CopilotModel {
  id: string;
  name: string;
  tokenizer: string;
  max_input_tokens: number;
  max_output_tokens: number;
  streaming: boolean;
  tools: boolean;
  use_responses: boolean;
}

export const fetchModels = Effect.gen(function* (_) {
  const copilot = yield* _(CopilotService);
  const raw = yield* _(copilot.request<unknown>("GET", "/models"));

  const response = yield* _(
    Schema.decodeUnknown(ModelsResponse)(raw).pipe(
      Effect.mapError((e) => new ParseError(String(e))),
    ),
  );

  return response.data
    .filter((m) => m.capabilities?.type === "chat" && m.model_picker_enabled)
    .map((m) => ({
      id: m.id,
      name: m.name,
      tokenizer: m.capabilities?.tokenizer || "o200k_base",
      max_input_tokens: m.capabilities?.limits?.max_prompt_tokens || 128000,
      max_output_tokens: m.capabilities?.limits?.max_output_tokens || 16384,
      streaming: m.capabilities?.supports?.streaming || false,
      tools: m.capabilities?.supports?.tool_calls || false,
      use_responses: (m.supported_endpoints || []).includes("/responses"),
    }));
});
