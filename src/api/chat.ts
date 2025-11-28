import { CopilotClient } from './copilot-client';
import { CopilotModel } from './models';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export async function* chatStream(
  client: CopilotClient,
  model: CopilotModel,
  messages: ChatMessage[],
  options: { temperature?: number } = {},
): AsyncGenerator<string, void, unknown> {
  if (model.use_responses) {
    try {
      yield* streamResponsesAPI(client, model, messages);
      return;
    } catch (e) {
      console.warn('Responses API failed, falling back to Chat Completions:', e);
    }
  }

  yield* streamChatCompletions(client, model, messages, options);
}

async function* streamResponsesAPI(
  client: CopilotClient,
  model: CopilotModel,
  messages: ChatMessage[],
): AsyncGenerator<string, void, unknown> {
  const systemMsg = messages.find(m => m.role === 'system');
  const inputMessages = messages.filter(m => m.role !== 'system');

  const body = {
    model: model.id,
    stream: true,
    input: inputMessages.map(m => ({ role: m.role, content: m.content })),
    ...(systemMsg && { instructions: systemMsg.content }),
  };

  for await (const chunk of client.stream('/responses', body)) {
    if (chunk.type === 'response.content.delta' || chunk.type === 'response.output_text.delta') {
      const text = extractTextFromDelta(chunk.delta);
      if (text) yield text;
    }
  }
}

async function* streamChatCompletions(
  client: CopilotClient,
  model: CopilotModel,
  messages: ChatMessage[],
  options: { temperature?: number },
): AsyncGenerator<string, void, unknown> {
  const body = {
    model: model.id,
    stream: true,
    messages: messages.map(m => ({ role: m.role, content: m.content })),
    ...(options.temperature !== undefined && { temperature: options.temperature }),
  };

  for await (const chunk of client.stream('/chat/completions', body)) {
    const content = chunk.choices?.[0]?.delta?.content;
    if (content) yield content;
  }
}

function extractTextFromDelta(delta: any): string {
  if (typeof delta === 'string') return delta;
  if (delta?.text) return delta.text;
  if (delta?.content) return delta.content;
  if (delta?.output_text) {
    if (typeof delta.output_text === 'string') return delta.output_text;
    if (delta.output_text.text) return delta.output_text.text;
  }
  return '';
}
