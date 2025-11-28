import { chatStream, ChatMessage } from '../api/chat';
import { CopilotClient } from '../api/copilot-client';
import { CopilotModel } from '../api/models';

export interface AskOptions {
  system?: string;
  temperature?: number;
  stream?: boolean;
}

export class CopilotChatInstance {
  private history: ChatMessage[] = [];

  constructor(
    private client: CopilotClient,
    private model: CopilotModel,
  ) {}

  async ask(userMessage: string, options: AskOptions = {}): Promise<string> {
    const messages: ChatMessage[] = [];

    if (options.system) {
      messages.push({ role: 'system', content: options.system });
    }

    messages.push(...this.history);
    messages.push({ role: 'user', content: userMessage });

    let fullResponse = '';
    const shouldStream = options.stream !== false;

    for await (const chunk of chatStream(this.client, this.model, messages, {
      temperature: options.temperature,
    })) {
      if (shouldStream) {
        process.stdout.write(chunk);
      }
      fullResponse += chunk;
    }

    if (shouldStream && fullResponse) {
      process.stdout.write('\n');
    }

    this.history.push({ role: 'user', content: userMessage });
    this.history.push({ role: 'assistant', content: fullResponse });

    return fullResponse;
  }

  getHistory(): ChatMessage[] {
    return [...this.history];
  }

  clearHistory(): void {
    this.history = [];
  }
}
