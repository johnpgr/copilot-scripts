import * as Stream from "effect/Stream";
import { CopilotModel } from "./models";
import { CopilotService } from "../services/CopilotService";
import { ApiError, AuthError, FsError, ParseError } from "../errors";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export const chatStream = (
  copilot: CopilotService,
  model: CopilotModel,
  messages: ChatMessage[],
  options: { temperature?: number } = {},
): Stream.Stream<string, ApiError | AuthError | FsError | ParseError> => {
  if (model.use_responses) {
    return Stream.catchAll(streamResponsesAPI(copilot, model, messages), () =>
      streamChatCompletions(copilot, model, messages, options),
    );
  }
  return streamChatCompletions(copilot, model, messages, options);
};

function streamResponsesAPI(
  copilot: CopilotService,
  model: CopilotModel,
  messages: ChatMessage[],
): Stream.Stream<string, ApiError | AuthError | FsError | ParseError> {
  const systemMsg = messages.find((m) => m.role === "system");
  const inputMessages = messages.filter((m) => m.role !== "system");

  const body = {
    model: model.id,
    stream: true,
    input: inputMessages.map((m) => ({ role: m.role, content: m.content })),
    ...(systemMsg && { instructions: systemMsg.content }),
  };

  return Stream.flatMap(copilot.stream("/responses", body), (chunk) => {
    if (
      chunk.type === "response.content.delta" ||
      chunk.type === "response.output_text.delta"
    ) {
      const text = extractTextFromDelta(chunk.delta);
      return text ? Stream.succeed(text) : Stream.empty;
    }
    return Stream.empty;
  });
}

function streamChatCompletions(
  copilot: CopilotService,
  model: CopilotModel,
  messages: ChatMessage[],
  options: { temperature?: number },
): Stream.Stream<string, ApiError | AuthError | FsError | ParseError> {
  const body = {
    model: model.id,
    stream: true,
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
    ...(options.temperature !== undefined && {
      temperature: options.temperature,
    }),
  };

  return Stream.flatMap(copilot.stream("/chat/completions", body), (chunk) => {
    const content = chunk.choices?.[0]?.delta?.content;
    return content ? Stream.succeed(content) : Stream.empty;
  });
}

function extractTextFromDelta(delta: any): string {
  if (typeof delta === "string") return delta;
  if (delta?.text) return delta.text;
  if (delta?.content) return delta.content;
  if (delta?.output_text) {
    if (typeof delta.output_text === "string") return delta.output_text;
    if (delta.output_text.text) return delta.output_text.text;
  }
  return "";
}
